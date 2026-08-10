## Why

Presentations are currently persisted as complete HTML documents in both the current generation row and every immutable revision. A small edit therefore duplicates the entire presentation, while HTML-specific animation and rendering details are repeated even though they can be reconstructed from a compact, typed document model.

The system needs a structured source of truth that supports extensible element types, structural sharing between revisions, and deterministic render-on-demand without storing generated HTML.

## What Changes

- **BREAKING** Replace persisted presentation HTML with a normalized structured slide document composed of immutable slides and polymorphic, recursively nestable elements.
- Introduce a generic `SlideElement` composite model whose type-specific properties are stored as validated JSON, allowing new element types without a database migration for each type.
- Represent text, shapes, images, tables, table cells, and future containers through the same element model; child elements use a parent reference and container-defined slot metadata.
- Store revision composition separately from immutable slide content so unchanged slides can be shared across revisions instead of copied.
- **BREAKING** Render preview and downloadable HTML from structured data on demand; generated HTML is no longer persisted as the presentation source of truth or copied into revisions.
- Introduce a shared animation registry contract. Elements persist only an animation key and optional timing overrides; animation implementations are versioned and deployed by developers in a separate JavaScript library.
- Add validation for element schemas, tree integrity, supported animation keys, geometry, container slots, and bounded nesting depth.
- Migrate compatible existing presentations from stored design HTML into the structured model and define explicit handling for legacy content that cannot be represented losslessly.

## Capabilities

### New Capabilities

- `structured-slide-document`: Defines the normalized slide and element model, composite containers, extensible type registry, shared animation references, structural revision sharing, validation, and render-on-demand behavior.

### Modified Capabilities

- `slide-generation-workflow`: Changes presentation persistence, generation completion, edit and undo revisions, detail responses, and downloadable output from stored full-document HTML to structured documents rendered on demand.

## Impact

- Prisma schema and migrations for slide projects, revisions, immutable slides, revision-to-slide composition, and recursive elements.
- Slide domain schemas, renderer, animation registry integration, structured-document validation, and legacy HTML migration tooling.
- Application services, repository ports, Prisma repository transactions, optimistic concurrency, edit/undo reconstruction, and ownership handling.
- Slide generation and AI edit adapters must produce or be converted into validated structured documents.
- Slide API response and save contracts change from HTML input/output to structured document data, with a separate render/download path for generated HTML.
- The visual editor scene graph, parser/serializer, table tooling, preview, export, and tests must align with the shared structured-document contract.
- Existing HTML-only revisions require a staged migration and compatibility policy before removal of `htmlContent` columns.
