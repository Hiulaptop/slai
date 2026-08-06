## Why

SLAI already supports AI-generated decks and text feedback editing, but users cannot start from a blank canvas or a template and visually design slides themselves. A direct create → template-or-blank → design tools → HTML export path is needed so owners can author and download standalone presentations without relying only on AI outline and feedback loops.

## What Changes

- Add a protected entry flow from Create that asks the user to choose a **library template** or a **blank project**, then opens the visual slide design editor.
- Support creating a new presentation project without report upload, outline review, or provider generation when the user picks blank or template-only start.
- Add a visual design editor with drawing and layout tools (text, shapes, images, selection, alignment, layers, and slide chrome) that edits the presentation HTML structure under the existing `.slai-slide` contract.
- Persist design-editor changes as owner-scoped presentation revisions so reload and library resume stay consistent with existing access control.
- Reuse and strengthen standalone HTML export/download so the designed deck downloads as a navigable `.html` file independent of the SLAI runtime.
- Keep the existing AI create-with-report and feedback-edit paths available; this change adds a parallel design-first authoring path rather than removing generation.

## Capabilities

### New Capabilities

- `visual-slide-design-editor`: Covers template-or-blank project start, visual design tools on the canvas, slide management, save/revision behavior for design edits, and HTML export/download of the designed deck.

### Modified Capabilities

- `simplified-web-frontend`: Extends Create entry so users can open the design-first path (template or blank) in addition to the existing report-driven creation workspace.
- `user-template-library`: Allows selecting an owned template as the structural/visual base for a blank design project (not only for AI generation).
- `slide-generation-workflow`: Adds a non-AI presentation bootstrap path (blank or template-seeded HTML) that still produces owner-owned presentations compatible with detail, revision, and export contracts.

## Impact

- Protected App Router create entry and new or extended editor route for design mode.
- New client design-canvas components and tool model; possible dependency on a canvas/editor library if chosen in design.
- Backend bootstrap endpoint(s) for blank and template-seeded presentations; revision persistence for design saves.
- Template library selection reused outside AI generation.
- Existing `exportStandalonePresentation` / Download HTML path remains the download surface, extended if design HTML needs extra export rules.
- Tests for bootstrap, tools, save, ownership, and export; no change to auth token model.
