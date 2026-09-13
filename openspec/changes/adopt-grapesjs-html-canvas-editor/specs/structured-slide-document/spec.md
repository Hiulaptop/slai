## MODIFIED Requirements

### Requirement: Structured document is the presentation source of truth
The system MUST persist completed presentations and revisions as validated, sanitized per-slide HTML/CSS and MUST NOT require a typed element-graph representation as the presentation or revision content.

#### Scenario: Persist completed structured presentation
- **WHEN** generation, blank bootstrap, design save, edit, or undo successfully commits a completed presentation revision
- **THEN** the system stores revision metadata and the sanitized per-slide HTML/CSS that revision represents

#### Scenario: Rendered output is transient
- **WHEN** the system serves a presentation for preview or download
- **THEN** it returns the persisted per-slide HTML/CSS assembled into a complete document without generating or requiring a separate structured render step, and does not persist that assembled document separately from the revision's own HTML/CSS

### Requirement: Structural sharing across revisions
The system MUST reuse immutable per-slide HTML/CSS snapshots that do not change between revisions.

#### Scenario: Change one slide
- **WHEN** a mutation changes one slide in a presentation containing multiple slides
- **THEN** the new revision references the prior immutable HTML/CSS snapshots for every non-target slide and creates a replacement snapshot only for the changed slide

#### Scenario: Change one nested element
- **WHEN** a mutation changes one nested element within a slide's HTML (for example, a single component inside a container)
- **THEN** the system creates a replacement snapshot only for the changed slide's HTML/CSS, the same as any other single-slide change, without requiring per-node structural sharing below the slide level

#### Scenario: Historical read
- **WHEN** an owner retrieves an older revision
- **THEN** its composition resolves to the same immutable per-slide HTML/CSS that was current when that revision was committed

### Requirement: Atomic structured revisions
The system SHALL commit per-slide HTML/CSS snapshots, slide composition, revision metadata, and the current revision pointer atomically with optimistic concurrency.

#### Scenario: Successful compare-and-swap
- **WHEN** a valid mutation supplies the current expected revision
- **THEN** the system creates one complete immutable revision and advances the current and next revision pointers in the same transaction

#### Scenario: Stale structured mutation
- **WHEN** the expected revision no longer matches the current revision
- **THEN** the system returns status `409`, leaves the current composition unchanged, and creates no reachable or orphaned revision

### Requirement: Deterministic render on demand
The system SHALL provide a portable deterministic assembler that combines a completed revision's persisted per-slide HTML/CSS into safe complete HTML for preview and standalone download.

#### Scenario: Render preview
- **WHEN** an authorized owner requests a preview of a completed revision
- **THEN** the system resolves its persisted per-slide HTML/CSS, escapes or re-sanitizes it defensively, and returns safe HTML without persisting the assembled document

#### Scenario: Download standalone presentation
- **WHEN** an authorized owner requests a downloadable presentation
- **THEN** the system returns a complete `.html` document with application-owned navigation, one stylesheet covering every slide's CSS, and no remote runtime or content dependencies

#### Scenario: Render malformed stored structure
- **WHEN** stored per-slide HTML/CSS fails sanitization or a required structural invariant
- **THEN** the assembler fails closed with a stable non-sensitive error instead of emitting partial or unsafe HTML

#### Scenario: Compile only at render boundaries
- **WHEN** the system produces preview or download output
- **THEN** it assembles the complete document from the revision's persisted per-slide HTML/CSS at that time and does not retain the assembled output as part of generation, revision, cache, or log records

## REMOVED Requirements

### Requirement: Generic versioned element nodes
**Reason**: Slide content is authored and persisted as GrapesJS-produced HTML/CSS rather than typed `ElementNode`s, so a generic node/type/schema-version contract no longer applies.
**Migration**: Existing structured element graphs must be rendered once through the prior renderer and stored as the resulting per-slide HTML/CSS; no runtime code depends on the node contract afterward.

### Requirement: Composite element integrity
**Reason**: Graph topology (reachability, cycles, child slots) was a constraint on the element-graph model, which this change removes in favor of HTML/CSS.
**Migration**: Not applicable after the migration in "Generic versioned element nodes" completes; HTML validity/sanitization rules replace graph-topology validation.

### Requirement: Tables use the generic composite model
**Reason**: Tables are authored as ordinary HTML `<table>` markup through the canvas rather than as a registered composite element type.
**Migration**: Convert existing `table` elements to their rendered `<table>` HTML during the same one-time migration as other element types.

### Requirement: Shared animation registry references
**Reason**: Entrance animations were expressed as a registry key plus validated per-element options tied to the element-graph model; GrapesJS-authored content does not carry that reference.
**Migration**: Reintroducing entrance animations requires a new HTML/CSS-native mechanism (for example, authored CSS classes/keyframes resolved through the same content-safety rules as other CSS); until that exists, animations authored before this change are dropped when a slide is converted, and this loss must be communicated to affected owners before migration runs.

### Requirement: Whitelisted Tailwind class resolution for text font-size and color
**Reason**: This requirement only existed to let AI-authored structured elements express font-size/color as Tailwind classes resolved before graph validation; HTML/CSS authored directly through the canvas does not go through that resolution step.
**Migration**: None needed for existing content; the compiled Tailwind stylesheet step is replaced by treating any CSS the canvas or generation produces as ordinary persisted CSS, subject to the same sanitization as the rest of the document.

### Requirement: Legacy migration preserves content explicitly
**Reason**: This requirement governed migrating *away* from HTML storage toward the structured graph. This change reverses that direction, so the requirement's premise no longer holds and must be replaced by an explicit backend decision on how to migrate current structured-graph presentations *into* HTML, not silently dropped.
**Migration**: A backend engineer must define and validate a one-time conversion from every stored element graph to equivalent per-slide HTML/CSS (rendering each structured revision once through the existing renderer) before any structured-graph columns or tables are removed, and must explicitly decide the disposition of animations per the "Shared animation registry references" migration note above.
