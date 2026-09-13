## Why

Both editors currently manipulate slides through a hand-rolled `ElementNode`/`SlideDocument` graph: `design-canvas.tsx` implements pointer-based move/resize for a fixed set of element types (text, shape, image, table), and `slide-editor.tsx` has no direct-manipulation canvas at all — it only previews a slide in a sandboxed iframe and collects free-text feedback for the AI to re-generate. Neither gives users a real HTML drag-and-drop editing surface, and every new element type or layout capability requires new domain schema, registry, and canvas code. Replacing both with GrapesJS gives users an actual WYSIWYG HTML/CSS editor and removes the constant need to grow a bespoke element-type registry to support ordinary HTML layout.

## What Changes

- Replace `design-canvas.tsx` + the drag/resize logic in `design-editor.tsx` with a GrapesJS-based canvas that edits real HTML/CSS blocks/components instead of typed `ElementNode`s.
- Replace the read-only iframe preview in `slide-editor.tsx` with the same GrapesJS canvas, so per-slide feedback in that flow becomes direct HTML editing instead of (or alongside) free-text AI instructions.
- **BREAKING**: Change the slide persistence contract from the structured element/animation graph (`SlideDocument.elements`) to raw per-slide HTML/CSS as the saved and generated representation. This reverses the structured-slide-document capability's core "MUST NOT persist generated HTML" requirement and its element-graph, animation-registry, and Tailwind-whitelist requirements, which were built specifically to keep HTML out of storage.
- **BREAKING**: Change outline/generation/edit/design-save API contracts (`/api/slides/generate`, `/api/slides/edit`, `/api/slides/design/save`, presentation detail) to accept and return per-slide HTML/CSS instead of the structured document schema.
- Drop the element-type registry, animation registry, and Tailwind-class-whitelist resolution as the mechanism for authoring slide content, since GrapesJS-authored HTML is not expressed through typed element props.
- Keep existing per-slide undo/revision *behavior* (owner-scoped, atomic, compare-and-swap) but its content unit becomes an HTML/CSS snapshot instead of an element-graph snapshot.

## Capabilities

### New Capabilities

- `slide-html-canvas-editor`: The GrapesJS-based drag-and-drop HTML canvas used by both the design editor and the per-slide feedback editor — component/block model, style manager, selection, and the frontend save/load contract against per-slide HTML.

### Modified Capabilities

- `structured-slide-document`: Replaces the element-graph/animation-registry/Tailwind-whitelist source of truth with raw per-slide HTML/CSS as the persisted and rendered presentation content. This is a backend/domain and persistence-schema change (Prisma models, structured graph tables, renderer) outside this repository's frontend/presentation scope for implementation, and is included here so a backend engineer can pick it up.
- `slide-generation-workflow`: Changes the generation, batch-edit, and design-save request/response contracts to carry HTML/CSS instead of the structured document schema, and removes the Tailwind-class-whitelist and template/report generation prompt's structured-schema requirement in favor of an HTML-output requirement. Route handlers, prompts, and application services are backend/domain surface outside this repository's frontend/presentation scope for implementation.

## Impact

- Frontend (in scope for this repo's frontend agent to implement): `components/design-canvas.tsx`, `components/design-editor.tsx`, `components/slide-editor.tsx`, and their tests; adds a GrapesJS dependency and CSS; changes `lib/slides/design-document.ts`-facing types (`SlideDocument`, `ElementNode`, `DesignSaveRequest`, `PresentationDetail`) once the new contract is defined; changes `Docs/DESIGN.md` and `Docs/CHANGELOG.md`.
- Backend/domain (out of scope for this repository's frontend agent — requires a separate implementation effort): `modules/slides/domain/structured/**`, `modules/slides/application/**`, `modules/slides/infrastructure/structured/**` (including the Tailwind compiler and element/animation registries), `app/api/slides/**/route.ts`, and `prisma/**` schema/migrations for the structured graph tables.
- Removes the legacy-HTML-migration safeguard's premise (`structured-slide-document`'s "Legacy migration preserves content explicitly" requirement assumed HTML was being migrated away from, not back to); that requirement needs explicit backend reconsideration, not silent removal.
- Users lose the typed shape/table/animation authoring tools during the transition unless GrapesJS plugins/custom blocks are used to reintroduce equivalent authoring for shapes, tables, and entrance animations.
