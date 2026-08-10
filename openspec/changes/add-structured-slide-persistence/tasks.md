## 1. Structured Contract and Registries

- [x] 1.1 Define shared versioned structured-document DTOs for revisions, slide snapshots, generic element nodes, child edges, geometry, animation references, and mutation commands.
- [x] 1.2 Implement strict element registry contracts for property schemas, defaults, container child policies, schema migrations, and portable render definitions.
- [x] 1.3 Register the initial `text`, `shape`, `image`, `table`, and `table-cell` definitions, including table slot/span validation and the first-release prohibition on nested tables.
- [x] 1.4 Implement the separately versioned animation registry interface and initial safe application-owned definitions, including option validation and unavailable-version errors.
- [x] 1.5 Implement graph validation for reachability, acyclicity, unique slots and order, registered type/version pairs, geometry, ownership-safe references, configured count limits, and maximum depth.
- [x] 1.6 Add unit tests for every element definition, future-type registration without schema changes, valid nested content, table validation, cycles, duplicate slots, unreachable nodes, depth limits, and animation references.

## 2. Structured Persistence Schema

- [x] 2.1 Add Prisma models and a non-destructive migration for revision-to-slide composition, immutable slide snapshots, top-level snapshot elements, generic immutable element nodes, and immutable child edges while retaining legacy HTML columns.
- [x] 2.2 Add primary, unique, foreign-key, cascade, and lookup indexes that enforce revision slide numbering, top-level order, and parent slot/order uniqueness without using a database enum for element types.
- [x] 2.3 Extend repository ports with structured revision read/write commands and resolved read models without exposing Prisma entities to the application layer.
- [x] 2.4 Implement bounded-query graph loading and deterministic in-memory assembly for current and historical revisions, including detection of malformed stored references.
- [x] 2.5 Implement transactional copy-on-write persistence that reuses unchanged slide snapshots and element subgraphs while copying only changed leaves, ancestor paths, and slide compositions.
- [x] 2.6 Add repository tests proving structural sharing, historical immutability, nested-element copy-on-write, compare-and-swap conflicts, rollback without orphan revisions, branching after undo, and owner-scoped deletion.

## 3. Portable Rendering and Export

- [ ] 3.1 Replace the browser-only object-to-HTML path with a pure renderer that runs in Node and browser runtimes without `DOMParser`.
- [ ] 3.2 Render all initial element definitions and composite children through escaped, allowlisted HTML and CSS while preserving slide dimensions, ordering, stacking, table layout, and remote-resource restrictions.
- [ ] 3.3 Resolve versioned animation registry definitions into application-owned output and reject unknown versions, keys, invalid options, and user-provided executable content.
- [ ] 3.4 Add standalone navigation, keyboard controls, and print behavior to transient downloads without writing generated HTML to persistence or logs.
- [ ] 3.5 Add renderer tests for deterministic output, escaping, malformed stored graphs, table/cell composition, animation output, offline export, remote dependency rejection, and server/browser parity.

## 4. Application and Revision Workflows

- [ ] 4.1 Update lifecycle access checks and presentation detail read models to require and return a valid current structured revision instead of current HTML.
- [ ] 4.2 Convert blank design bootstrap to create structured revision 1 without invoking the AI provider or generating stored HTML.
- [ ] 4.3 Convert design save to validate a structured mutation command and atomically persist a copy-on-write revision using the client expected revision.
- [ ] 4.4 Change generation prompts and model-output parsing to request and validate strict structured slide documents aligned with the approved outline.
- [ ] 4.5 Change batch edit prompts and application logic to persist only requested replacement slide snapshots while preserving non-target snapshot IDs.
- [ ] 4.6 Change per-slide undo to append an immutable `UNDO` revision referencing the prior differing slide snapshot while preserving all non-target references.
- [ ] 4.7 Update service and policy tests for structured bootstrap, generation, detail, design save, batch edit, repeated undo, branching, stale mutations, provider failures, and non-target structural sharing.

## 5. API and Presentation Contracts

- [ ] 5.1 Replace HTML fields in presentation detail, bootstrap, design save, generation, edit, and undo DTOs with bounded structured-document fields while keeping list summaries body-free.
- [ ] 5.2 Add owner-authorized transient render and standalone download routes with stable content type, attachment filename, lifecycle validation, and concealed non-owner `404` behavior.
- [ ] 5.3 Preserve authentication-before-parse and consistent `400`, `401`, `404`, `409`, `502`, and safe `500` mappings for structured validation, ownership, concurrency, provider, and renderer failures.
- [ ] 5.4 Add route tests for valid structured payloads, malformed graph input, stale revision conflicts, preview/download output, unsupported registry versions, incomplete presentations, and owner isolation.

## 6. Visual Editor Integration

- [ ] 6.1 Align the client scene graph with the shared structured DTO and replace independent parser, serializer, creation, and rendering fallthrough branches with registry-backed dispatch.
- [ ] 6.2 Update editor load, local mutation, save, conflict reload, preview, and download flows to consume and submit structured documents without depending on stored HTML.
- [ ] 6.3 Add a table tool that creates table and table-cell composite nodes, supports row and column configuration, and edits typed cell content through the generic element model.
- [ ] 6.4 Integrate animation selection through registry metadata while persisting only animation keys and validated option overrides.
- [ ] 6.5 Update canvas/editor tests for every initial type, generic future-type dispatch, nested cells, table mutations, animation references, structured save conflicts, and transient downloads.
- [ ] 6.6 Add an entry under `Docs/CHANGELOG.md` `[Unreleased]` describing the structured editor contract, table elements, animation references, and render-on-demand behavior.

## 7. Legacy Migration and Cutover

- [ ] 7.1 Implement a dry-run migration classifier that parses recognized design-marker HTML into structured documents and records unsupported legacy content without changing source rows.
- [ ] 7.2 Implement idempotent backfill for compatible generations and every retained revision, including structured validation and deterministic rendered-output comparison before marking conversion complete.
- [ ] 7.3 Provide an auditable report of converted, failed, and unsupported presentations and require an explicit retention or manual-conversion disposition for every unsupported record.
- [ ] 7.4 Introduce feature flags for structured writes and reads, deploy dual-read compatibility, and verify rollback to the retained HTML path before destructive migration.
- [ ] 7.5 Switch all generation, save, edit, undo, detail, preview, and download traffic to structured revisions and monitor validation, persistence, and rendering failures.
- [ ] 7.6 After migration gates pass and backups are restore-tested, remove `SlideGeneration.htmlContent`, `SlideRevision.htmlContent`, full-HTML write paths, and obsolete legacy parser code in a separate irreversible migration.

## 8. Verification

- [ ] 8.1 Run Prisma validation and migration tests against a representative database containing blank-design, visual-design, AI-generated, edited, undone, branched, and unsupported legacy presentations.
- [ ] 8.2 Run `pnpm lint`, project type checking, `pnpm test`, and `pnpm build`, and resolve all registry exhaustiveness, API contract, rendering, repository, and UI failures.
- [ ] 8.3 Run `openspec validate add-structured-slide-persistence --strict` and resolve every proposal/spec consistency and scenario-format error.
- [ ] 8.4 Benchmark storage growth, current/historical revision reads, copy-on-write saves, preview rendering, and download rendering with realistic slide, element, image, table, and revision counts.
- [ ] 8.5 Browser-verify blank creation, AI generation, text/shape/image/table editing, nested cell content, animation preview, concurrent save conflict, per-slide undo, library resume, and offline HTML download on desktop and mobile.
