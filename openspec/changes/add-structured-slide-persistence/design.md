## Context

The current slide aggregate stores one complete HTML document in `SlideGeneration.htmlContent` and another complete HTML document in every `SlideRevision.htmlContent`. Generation, design save, AI edit, and undo therefore write the complete deck twice per mutation. Revision storage grows with `(revision count x complete HTML size)` even when an operation changes one element on one slide.

The visual editor already has a client-only discriminated-union scene graph and an object-to-HTML serializer, but the database, application service, and AI workflow use HTML as the source of truth. There is no server-compatible structured renderer and no slide-content animation model. The new design must support existing owner isolation, immutable branching revisions, compare-and-swap mutation, AI generation/editing, visual editing, and standalone HTML download.

The target flow is:

```text
AI or visual editor
  -> validated structured document command
  -> immutable slide and element DAG
  -> revision-to-slide composition
  -> current revision pointer

Preview or download
  -> load structured revision
  -> resolve element registry and animation registry
  -> render safe standalone HTML in memory
  -> return HTML without persisting it
```

## Goals / Non-Goals

**Goals:**

- Make structured slide data, rather than generated HTML, the sole source of truth for new presentations and revisions.
- Avoid copying unchanged slides and element subtrees across revisions through immutable structural sharing.
- Model all present and future element types through one extensible node schema without type-specific database tables or migrations.
- Represent table cells as ordinary composite elements so a cell can contain typed child elements.
- Provide one versioned element registry for validation, creation, structured parsing, and rendering.
- Store only references to centrally deployed animation definitions, with optional per-element timing and registry-defined parameters.
- Generate deterministic safe HTML for preview and download without retaining the rendered result.
- Preserve owner isolation, lifecycle validation, immutable branching revisions, and optimistic concurrency.

**Non-Goals:**

- Providing an end-user animation authoring or animation-library management interface.
- Persisting arbitrary executable JavaScript, CSS keyframes, event handlers, or generated HTML in slide rows.
- Supporting database queries over every type-specific property stored in element JSON.
- Making element definitions editable without a code deployment.
- Guaranteeing lossless automatic conversion of arbitrary historical AI-generated HTML.

## Decisions

### Keep presentation lifecycle metadata but replace HTML snapshots

Retain the existing presentation/generation lifecycle aggregate and identifiers to minimize API and ownership migration, but remove `htmlContent` from the target `SlideGeneration` and `SlideRevision` schema. A revision records metadata and a composition of immutable slide snapshots; the current revision pointer remains on the generation row.

The conceptual target schema is:

```text
SlideGeneration
  id, userId, status, title, provider, modelId, request/response metadata,
  approvedOutline, currentRevisionNumber, nextRevisionNumber, timestamps

SlideRevision
  id, slideGenerationId, revisionNumber, parentRevisionNumber,
  operation, editRequest, changedSlideNumbers, createdAt

SlideRevisionSlide
  slideRevisionId, slideNumber, slideSnapshotId
  PK(slideRevisionId, slideNumber)

SlideSnapshot
  id, width, height, props, createdAt

SlideSnapshotElement
  slideSnapshotId, elementNodeId, orderIndex
  PK(slideSnapshotId, orderIndex)
```

`SlideRevisionSlide` is the ordered revision composition. A new revision reuses every unchanged `slideSnapshotId`. A changed slide receives a new `SlideSnapshot`, while its unchanged top-level element nodes remain shareable through `SlideSnapshotElement`.

**Alternatives:** Rename `SlideGeneration` to `SlideProject`; rejected for this change because it adds a broad identifier and API migration unrelated to eliminating HTML persistence. Store a structured JSON document in each revision; rejected because it still copies every unchanged slide and element on each mutation.

### Store elements as an immutable persistent DAG

Use one immutable node table and one immutable edge table:

```text
SlideElementNode
  id                    CHAR(36) PK
  type                  VARCHAR(100)
  schemaVersion         INT
  x, y, width, height   DOUBLE nullable
  zIndex                INT nullable
  props                 JSON
  animationKey          VARCHAR(100) nullable
  animationProps        JSON nullable
  createdAt             DATETIME

SlideElementChild
  parentElementNodeId   FK -> SlideElementNode
  childElementNodeId    FK -> SlideElementNode
  slotKey               VARCHAR(100)
  orderIndex            INT
  PK(parentElementNodeId, slotKey)
  UNIQUE(parentElementNodeId, orderIndex)
```

Nodes and edges are never updated after publication. Editing a leaf creates a replacement leaf and copies only its ancestor path; unchanged siblings and subtrees retain their existing node IDs. Top-level element changes similarly create a new `SlideSnapshot` whose composition reuses unchanged nodes. This is a persistent directed acyclic graph, not an arbitrary mutable self-referencing tree.

`type` is a validated string rather than a database enum. `props` and `animationProps` are JSON validated by the registry schema associated with `(type, schemaVersion)`. Common geometry remains in real columns because rendering and ordering use it across element types. New element types and new optional type-specific fields require code and registry updates, but no schema migration.

The application MUST reject cycles, duplicate node IDs, duplicate child slots, unreachable submitted nodes, references outside the owned command, unsupported type/version pairs, and trees deeper than the configured maximum. Initial maximum nesting depth is four element edges and is a domain constant rather than a database constraint.

**Alternatives:** A mutable self-referencing `SlideElement.parentElementId` table was considered; rejected because immutable revision sharing would require duplicating an entire subtree or mutating history. One table per element type was rejected because every new type would require schema migration. EAV was rejected because it weakens validation and requires expensive joins for ordinary rendering.

### Treat table and cell as registered composite element types

A table is a node with `type: "table"`. Its props define rows, columns, tracks, borders, and other table-level presentation properties. Each occupied grid slot is a child node with `type: "table-cell"` and a slot key such as `r0c0`; cell props contain row, column, row span, column span, padding, and cell styling. A cell is a container and can own ordered child nodes such as text, shape, or image.

The registry controls which child types and slot formats a container accepts. The first release rejects a `table` descendant beneath a `table-cell`, while the generic DAG remains capable of supporting nested tables later through a registry policy change rather than a database migration.

**Alternatives:** Store rows, columns, and cells in table-specific relational tables; rejected because chart, group, grid, or future container types would repeat the same schema-extension problem. Store cell text directly in table JSON; rejected because a cell must be an object that can contain typed content.

### Centralize element behavior in a versioned registry

Replace parallel non-exhaustive factory branches with a shared registry contract. Each registered element definition provides:

```ts
interface ElementDefinition<TProps> {
  type: string;
  schemaVersion: number;
  propsSchema: ZodType<TProps>;
  container: boolean;
  childPolicy?: ChildPolicy;
  createDefaults(): TProps;
  render(context: RenderContext, node: ElementNode<TProps>): RenderNode;
}
```

The exact renderer return representation may be an escaped HTML AST or equivalent internal structure, but definitions MUST remain portable between Node and browser runtimes and MUST not depend on `DOMParser`. Persistence accepts only registered `(type, schemaVersion)` pairs. Registry migrations convert old property versions to the current version when necessary.

**Alternatives:** Continue adding cases to independent parser, serializer, creation, and React rendering switches; rejected because missing one dispatch point currently causes silent fallthrough behavior. Use classes persisted by class name; rejected because class identity is not a stable storage contract and complicates serialization across runtimes.

### Keep animation implementations outside the database

Animation definitions live in a separately versioned JavaScript library deployed by developers and consumed by both the server renderer and client preview. A node stores only `animationKey` plus validated `animationProps`, such as duration, delay, easing, or definition-specific options. The animation registry exposes keys, defaults, option schemas, and safe render output.

The structured document records an `animationRegistryVersion` at the document or revision boundary. Rendering fails with a stable unsupported-version error if a required registry version or key is unavailable; it does not silently substitute a different animation. Animation output is application-owned and cannot contain user-provided JavaScript.

**Alternatives:** Persist complete CSS/keyframes per element; rejected because definitions would be duplicated and could introduce active content. Store animation entities and foreign keys in the database; rejected because animation deployment and addition are developer-controlled, not user-managed data.

### Render HTML on demand from validated structured data

Introduce a pure server-and-client-compatible renderer that receives a resolved structured revision and produces a complete standalone HTML document. It escapes user text and attributes, emits only allowlisted markup and styles, resolves registered animations, injects application-owned navigation for downloads, and performs no database writes.

Presentation detail returns the structured document required by the editor and may offer a separately requested rendered preview. Download returns `text/html` with `Content-Disposition: attachment`. Rendered HTML is not written to generation, revision, cache, or log storage by this change. Runtime HTTP caching can be considered separately, but persisted cache columns are not part of the source-of-truth model.

**Alternatives:** Continue persisting HTML as a cache beside structured data; rejected because it preserves the duplication this change is intended to remove and creates two sources of truth. Render only in the browser; rejected because authenticated download, server validation, and non-browser consumers need deterministic output.

### Preserve revision semantics with copy-on-write transactions

Generation completion, design save, AI edit, and undo create immutable nodes/snapshots and a complete `SlideRevisionSlide` composition inside one transaction. Compare-and-swap updates the generation's current and next revision numbers only after all referenced rows are ready. A stale mutation returns `409` and leaves no reachable or orphaned revision graph.

Undo resolves the target ancestor composition and appends a new `UNDO` revision that references the desired immutable snapshots; it does not mutate or delete history. Edit after undo creates a new branch with a monotonically allocated revision number. Garbage collection of unreferenced immutable nodes is deferred and MUST be ownership-safe and reference-aware when introduced.

**Alternatives:** Store JSON Patch events and replay every event for reads; rejected because read and recovery cost grows with history length. Mutate current element rows in place; rejected because it destroys revision immutability.

### Require structured AI output at the application boundary

Generation and edit prompts request a strict structured payload matching the shared document command schema rather than arbitrary complete HTML. Provider-neutral adapters continue returning normalized text/JSON responses. The application parses, validates, and persists the structure only after verifying outline alignment, supported elements, bounded size/count/depth, and safety rules.

Batch edits replace only requested slide snapshots. Non-target slides retain their prior `slideSnapshotId`, making non-target preservation verifiable without comparing complete HTML strings.

**Alternatives:** Generate HTML and parse it into structure on every new request; rejected because arbitrary HTML cannot be converted losslessly and would preserve an HTML-first contract. Permit providers to write database-shaped rows directly; rejected because provider output is untrusted and persistence topology is an internal concern.

## Risks / Trade-offs

- [Recursive graph data can contain cycles or excessive depth] -> Validate acyclicity, ownership, reachability, slot uniqueness, node/edge counts, and a maximum depth before persistence and rendering.
- [Persistent DAG reads require more joins than a single LongText read] -> Fetch a revision composition and its reachable graph in bounded queries, assemble it in memory, and benchmark realistic deck sizes.
- [Copy-on-write transactions can leave unreferenced nodes after failure] -> Create all graph rows and the revision pointer update in one transaction; add reference-aware cleanup only after measuring need.
- [JSON props weaken database-level type guarantees] -> Enforce strict versioned Zod schemas at every write boundary and validate migrated records before cutover.
- [Registry changes can alter old rendering] -> Record schema and animation registry versions, retain compatible render definitions, and use explicit migration functions for breaking definition changes.
- [Arbitrary legacy AI HTML may not map losslessly] -> Classify migrations, never silently discard content, retain a read-only legacy path until every deck is converted or covered by an approved retention policy.
- [Removing HTML from detail responses breaks existing clients] -> Version or atomically coordinate API and frontend changes; do not remove legacy fields before consumers use the structured contract.
- [Rendering on every preview/download adds CPU cost] -> Keep the renderer deterministic and benchmark it; use ordinary HTTP caching only if measurements require it, without making cached HTML authoritative.

## Migration Plan

1. Add the new structured tables and versioned element/animation registries while retaining existing HTML columns and old read paths.
2. Build and test the portable renderer, structured command schemas, graph validator, and repository read model before switching writes.
3. Add dual-read migration tooling that classifies existing decks: deterministically parse supported design-marker HTML, flag unsupported legacy HTML, and verify rendered output for converted records.
4. Switch blank design bootstrap and visual design save to structured writes behind a feature flag; keep legacy reads available during verification.
5. Switch AI generation and batch edit prompts to strict structured output, then switch undo and detail/download paths to structured revisions.
6. Backfill compatible historical presentations and publish an explicit retention or manual-conversion decision for every unsupported presentation.
7. Stop writing HTML, monitor structured render/save errors, and only then remove `htmlContent` columns and legacy parser code in a separate irreversible migration step.
8. Rollback before column removal by disabling structured writes and returning to the retained HTML path. After column removal, rollback requires restoring the pre-cutover backup and application version; therefore the destructive migration must have a tested backup and restore procedure.

## Open Questions

- What concrete maximum node count, edge count, and nesting depth should be accepted per presentation? The initial design uses depth 4; load tests should determine the remaining limits.
- Should structured detail and rendered preview share one endpoint through content negotiation or use separate endpoints? The lean is separate DTO and render/download routes to keep list/detail payloads bounded.
- Which historical AI decks can be converted losslessly, and what product policy applies to unsupported legacy decks? No destructive fallback is acceptable.
- Should `animationRegistryVersion` be recorded per revision or per presentation? The lean is per revision so historical rendering remains explicit when animation usage changes.
- When should reference-aware garbage collection remove unreferenced nodes left by abandoned revision branches or deleted projects? The lean is to rely on cascade deletion for projects first and defer cross-project deduplication and global GC.
