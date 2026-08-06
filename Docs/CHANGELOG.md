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

