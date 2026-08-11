## ADDED Requirements

### Requirement: Structured document is the presentation source of truth
The system MUST persist completed presentations and revisions as validated structured slide data and MUST NOT persist generated HTML as presentation or revision content.

#### Scenario: Persist completed structured presentation
- **WHEN** generation, blank bootstrap, design save, edit, or undo successfully commits a completed presentation revision
- **THEN** the system stores revision metadata and structured slide references without writing a complete rendered HTML document to generation or revision storage

#### Scenario: Rendered output is transient
- **WHEN** the system renders a presentation for preview or download
- **THEN** it returns the generated output without writing that HTML into presentation, revision, cache, or log records

### Requirement: Generic versioned element nodes
The system SHALL represent every slide element through one generic immutable node contract containing a type key, schema version, common geometry, type-specific validated properties, optional animation reference, and ordered child relationships.

#### Scenario: Persist a registered element type
- **WHEN** a structured command contains an element whose type, schema version, geometry, properties, and child policy satisfy the registered definition
- **THEN** the system persists that element through the generic node and edge model

#### Scenario: Add a future element type
- **WHEN** developers deploy a new registered element definition that uses the existing node contract
- **THEN** presentations can persist the new type without adding a type-specific database table or changing the element type column schema

#### Scenario: Unsupported element definition
- **WHEN** input references an unregistered type or unsupported schema version
- **THEN** the system rejects the complete command without persisting a partial graph

### Requirement: Composite element integrity
The system MUST validate the submitted element graph as an owned, reachable, acyclic, bounded directed graph with unique child slots and ordering within each container.

#### Scenario: Valid composite graph
- **WHEN** all submitted nodes are reachable from the submitted slides, contain no cycle, stay within configured node, edge, and depth limits, and satisfy their parent definitions' child policies
- **THEN** the system accepts the graph for persistence

#### Scenario: Invalid graph topology
- **WHEN** a command contains a cycle, duplicate child slot, duplicate order, unreachable node, cross-command node reference, excessive depth, or disallowed parent-child combination
- **THEN** the system returns an input validation error and persists no revision or graph rows

### Requirement: Tables use the generic composite model
The system SHALL model tables and table cells as registered element types rather than table-specific persistence entities.

#### Scenario: Persist a table
- **WHEN** a table command defines valid row and column properties and its occupied slots contain valid `table-cell` child nodes
- **THEN** the system persists the table, cells, and cell content through the same generic node and edge schema used by other elements

#### Scenario: Cell contains typed content
- **WHEN** a table cell contains one or more child elements allowed by the cell definition
- **THEN** each child retains its own registered type, version, properties, and ordering

#### Scenario: Invalid table layout
- **WHEN** cells overlap without a supported span, reference an out-of-range row or column, duplicate a grid slot, or contain a child type prohibited by the table-cell policy
- **THEN** the system rejects the structured command without persisting a revision

### Requirement: Structural sharing across revisions
The system MUST reuse immutable slide snapshots and element subgraphs that do not change between revisions.

#### Scenario: Change one slide
- **WHEN** a mutation changes one slide in a presentation containing multiple slides
- **THEN** the new revision references the prior immutable snapshots for every non-target slide and creates a replacement snapshot only for the changed slide

#### Scenario: Change one nested element
- **WHEN** a mutation changes a nested leaf element
- **THEN** the system creates a replacement leaf and ancestor path while reusing unchanged sibling nodes and subtrees

#### Scenario: Historical read
- **WHEN** an owner retrieves an older revision
- **THEN** its composition resolves to the same immutable slide and element data that was current when that revision was committed

### Requirement: Atomic structured revisions
The system SHALL commit graph rows, slide composition, revision metadata, and the current revision pointer atomically with optimistic concurrency.

#### Scenario: Successful compare-and-swap
- **WHEN** a valid mutation supplies the current expected revision
- **THEN** the system creates one complete immutable revision and advances the current and next revision pointers in the same transaction

#### Scenario: Stale structured mutation
- **WHEN** the expected revision no longer matches the current revision
- **THEN** the system returns status `409`, leaves the current composition unchanged, and creates no reachable or orphaned revision

### Requirement: Shared animation registry references
The system SHALL resolve animations from a developer-deployed versioned JavaScript registry and persist only a registry key plus validated per-element options.

#### Scenario: Render a supported animation
- **WHEN** an element references an animation key and options valid for the revision's animation registry version
- **THEN** preview and download rendering use the registry definition without reading animation implementation code from the database

#### Scenario: Unsupported animation reference
- **WHEN** an element references an unavailable registry version, unknown key, or invalid options
- **THEN** validation or rendering fails with a stable error and does not silently substitute another animation

#### Scenario: Safe animation output
- **WHEN** an animation definition is rendered
- **THEN** only application-owned registry output is emitted and user-provided executable JavaScript or raw keyframes are not accepted as element data

### Requirement: Deterministic render on demand
The system SHALL provide a portable deterministic renderer that converts a validated structured revision into safe complete HTML for preview and standalone download.

#### Scenario: Render preview
- **WHEN** an authorized owner requests a preview of a completed structured revision
- **THEN** the system resolves its slide and element graph, escapes user content, applies registered definitions, and returns safe HTML without persisting it

#### Scenario: Download standalone presentation
- **WHEN** an authorized owner requests a downloadable presentation
- **THEN** the system returns a complete `.html` document with application-owned navigation and animations that runs without the SLAI application runtime or remote content dependencies

#### Scenario: Render malformed stored structure
- **WHEN** a stored graph violates a required invariant or references an unavailable definition
- **THEN** the renderer fails closed with a stable non-sensitive error instead of emitting partial or unsafe HTML

### Requirement: Legacy migration preserves content explicitly
The system MUST classify and validate historical HTML presentations before removing legacy storage and MUST NOT silently discard content that cannot be converted losslessly.

#### Scenario: Convert supported design HTML
- **WHEN** a historical presentation uses recognized design element markers and passes structured validation after conversion
- **THEN** migration writes an equivalent structured revision and verifies its rendered output before marking the presentation converted

#### Scenario: Unsupported legacy HTML
- **WHEN** a historical presentation contains content that cannot be represented losslessly by registered element definitions
- **THEN** migration leaves it on an explicit read-only legacy path or flags it for an approved retention or manual-conversion policy

#### Scenario: Remove legacy columns
- **WHEN** any historical presentation lacks a verified structured replacement or approved legacy disposition
- **THEN** deployment does not remove the legacy HTML columns
