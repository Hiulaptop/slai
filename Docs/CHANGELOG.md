# Changelog

All notable frontend changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Scope: `app/**` (excluding `app/api/**/route.ts`) and `modules/*/presentation/**`, per `CLAUDE.md`. Backend/domain changes are tracked via `openspec/`, not here.

## [Unreleased]

### Added

- `CLAUDE.md`: frontend-agent scope constraints (editable surface, API-contract discipline, changelog/design-doc process).
- `Docs/CHANGELOG.md`: this file.
- Visual slide design editor frontend (`openspec/changes/add-visual-slide-design-editor/`): a Create-time path chooser between "design from template or blank" and the existing "generate from report" flow (`components/slide-creation-entry.tsx`, `components/design-project-setup.tsx`), and a new design editor at `/slides/[generationId]/design` (`components/design-editor.tsx`, `components/design-canvas.tsx`) with select/move/resize, text/rectangle/ellipse/line/image tools, layering, slide add/delete/reorder, local undo, save (with revision-conflict handling), and Download HTML (reusing `lib/slides/export-document.ts`'s `exportStandalonePresentation`). New pure scene-graph module: `lib/slides/design-document.ts`.
- `components/presentation-dashboard.tsx`: added a manual "Open in design editor" link on every library card, since no backend field yet distinguishes design-origin from AI-generated presentations (see the openspec change's task 4.4 notes).

### Changed

- `components/presentation-dashboard.tsx`: card markup restructured (title/status block now a nested `Link`, not the whole card) to fit the new secondary design-editor link without invalid nested anchors. Existing card behavior/links unchanged.
- **Structured slide persistence** (`openspec/changes/add-structured-slide-persistence/`): the visual design editor and the AI-generated presentation viewer now consume the structured, content-addressed element-graph model instead of HTML strings, end to end.
  - `PresentationDetail.document` (a `StructuredRevision`: `{animationRegistryVersion, slides}`) replaces `PresentationDetail.html` in every presentation API response (detail, bootstrap, generate, design save, edit, undo). List summaries remain body-free.
  - `DesignSaveRequest.slides` (nested `WireSlide[]`) replaces `DesignSaveRequest.html`.
  - New owner-authorized `GET /api/slides/[generationId]/render` (inline preview) and `GET /api/slides/[generationId]/download` (`Content-Disposition: attachment`) routes render on demand from the current structured revision and never persist the rendered HTML.
  - `lib/slides/design-document.ts` rewritten as a registry-backed scene graph: it reuses the actual server-side element/animation registries (`modules/slides/domain/structured/*`, which have no Node-only dependencies and run identically in the browser) for element defaults, prop schemas, and rendering, instead of a closed five-type union with its own parser/serializer.
  - `components/design-canvas.tsx` renders every element type (including future ones) through one generic `RenderNode -> React` conversion driven by the registry - no per-type rendering branches.
  - `components/design-editor.tsx`: added a table tool (row/column configuration, per-cell text editing) and an entrance-animation picker (key/duration/delay) populated from the animation registry's metadata, plus text formatting (style presets, bold/italic/underline, bullet list, alignment, fill/background color) that was previously unavailable in the UI.
  - `components/slide-editor.tsx` (the AI-generated presentation viewer): per-slide preview now renders through the shared portable renderer (`modules/slides/domain/structured/render.ts`) instead of extracting a fragment from a stored HTML document; download now fetches the server-rendered standalone file instead of building one client-side.
  - Removed `lib/slides/export-document.ts` and `lib/slides/slide-document.ts` (DOMParser-based HTML export/extraction) - no longer referenced now that rendering is server-authoritative.
- **GrapesJS HTML canvas editor** (`openspec/changes/adopt-grapesjs-html-canvas-editor/`): both slide editors now edit real per-slide HTML/CSS through a GrapesJS canvas instead of the typed element-graph scene graph.
  - Added `components/slide-html-canvas.tsx` (`SlideHtmlCanvas`): a shared GrapesJS-backed canvas component (load/edit/serialize per-slide HTML/CSS, with frontend sanitization via `modules/slides/domain/structured/sanitize.ts` before any save). Added the `grapesjs` dependency.
  - `components/design-editor.tsx`: replaced `DesignCanvas` and the tool palette/element-properties panel with `SlideHtmlCanvas`; removed the client-side undo stack in favor of GrapesJS's own undo manager plus the existing server-side per-slide undo action. Removed `components/design-canvas.tsx`.
  - `components/slide-editor.tsx`: replaced the read-only sandboxed `<iframe>` preview with `SlideHtmlCanvas` in edit-enabled mode; per-slide feedback can now be a free-text prompt, a directly authored canvas edit, or both, in one batch submission.
  - `lib/slides/design-document.ts` trimmed to canvas sizing/blank-document helpers now that slide content is plain HTML/CSS (`SlideDocument = { number, html, css }`) rather than a typed `ElementNode` scene graph; removed the element/animation registry re-exports.
  - **BREAKING**: `SlideDocument`, `WireSlide`, `PresentationDetail.document`, and `DesignSaveRequest.slides` now carry `{ number, html, css }` per slide instead of the typed element graph. `SlideEdit` gained optional `html`/`css` fields alongside `prompt`.
- **Slide canvas editor chrome** (`openspec/changes/abstract-slide-canvas-editor/`): the GrapesJS canvas now has a real editing surface - a toolbar, a block palette, and a layer list - instead of a bare canvas frame with no way to add a new element.
  - Added `hooks/use-slide-html-canvas.ts` (`useSlideHtmlCanvas`): extracted the GrapesJS instance lifecycle, dirty-state tracking, and sanitize-on-serialize logic out of `SlideHtmlCanvas` into a reusable headless hook, plus new `undo`/`redo`/`addBlock`/layer selection and reordering actions backed by GrapesJS's own `UndoManager` and component tree.
  - Added `components/canvas-toolbar.tsx` (`CanvasToolbar`: Undo/Redo, a save-state indicator), `components/canvas-block-palette.tsx` (`CanvasBlockPalette`: a curated Text/Heading/Image placeholder/Container block list, closing the previous gap where nothing could be added to a slide), and `components/canvas-layer-list.tsx` (`CanvasLayerList`: select/reorder existing components).
  - `components/slide-html-canvas.tsx` (`SlideHtmlCanvas`) rebuilt on `useSlideHtmlCanvas`, composing the three chrome pieces above the canvas frame. Added a `chrome?: { toolbar?; blockPalette?; layerList? }` prop (default: all shown) and a `saveState?: "idle" | "dirty" | "saving" | "saved"` prop for the toolbar's indicator. The existing `{ html, css, disabled, onDirtyChange }` props and `serialize()` imperative handle are unchanged.
  - `components/design-editor.tsx` renders the full chrome and feeds its own save/dirty state into the toolbar. `components/slide-editor.tsx` renders a reduced chrome (`chrome={{ blockPalette: false }}`) for its more touch-up-oriented direct-edit use.
