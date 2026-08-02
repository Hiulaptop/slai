## Why

SLAI now has authentication, a presentation library, and backend generation primitives, but the create route is only a placeholder and generated presentations have no browser editor. Users need one coherent workflow that turns their title, source files, template references, prompt, and requested slide count into a reviewable outline, then a generated deck that can be refined safely.

## What Changes

- Replace the `/slides/new` placeholder with a protected multi-phase creation workspace for basic information, source/template uploads, prompt, and requested slide count.
- Let users upload multiple data files and multiple visual template files, validate each file, review the selected files, and remove files before submission.
- Extend outline suggestion to consume title, prompt, requested slide count, and all authoritative data files in one provider request without sending visual template files to the model.
- Remove the product-level 50-slide ceiling from outline, generation, edit, and HTML validation contracts; accept any positive requested count that fits transport, provider-context, output-size, and runtime constraints.
- Add an outline review phase where every proposed slide title and description can be edited before generation.
- Extend generation to consume the approved outline, authoritative data files, and visual template files; treat template PDF pages as image-like design references while grounding all factual content exclusively in data files, then navigate directly to a protected presentation editor.
- Add an editor route that safely renders one generated slide at a time, supports previous/next and thumbnail navigation, and preserves the existing authenticated navbar.
- Add a per-slide feedback draft area fixed below the slide viewer. Users can move between slides without losing draft feedback and submit all non-empty slide instructions in one atomic batch-edit request.
- Show generation/edit progress, prevent duplicate submissions, and replace the presentation only after the provider result is validated and persisted.
- Add per-slide undo that restores only the selected slide's previous content while preserving other current slides and immutable revision history.
- Make presentation cards open the editor so existing completed presentations can be resumed from `/home`.

## Capabilities

### New Capabilities

- `slide-creation-editor`: Covers the protected multi-phase creation UI, outline review, generation transition, safe slide viewer, per-slide feedback drafts, batch submission, editor recovery states, and per-slide undo controls.

### Modified Capabilities

- `slide-generation-workflow`: Changes outline/generation input contracts to support metadata and multiple files, removes the fixed 50-slide ceiling, and replaces presentation-level undo behavior with immutable per-slide undo revisions.
- `simplified-web-frontend`: Replaces the create placeholder with the complete workflow and makes completed presentation summaries navigable to the editor.

## Impact

- Changes protected App Router pages under `/slides/new`, adds `/slides/{generationId}`, and updates the `/home` presentation cards.
- Changes outline, generation, edit, detail, and undo request/response behavior while retaining bearer authentication and owner-only access.
- Updates slide schemas, multipart parsing, prompts, application services, HTML helpers, repository ports, Prisma revision operation values, and migrations.
- Adds frontend creation/editor state, upload controls, safe iframe rendering, outline forms, feedback drafts, and integration-focused tests.
- Increases possible provider token use and latency for large requested decks; no arbitrary slide-count maximum is introduced, but existing file/request/HTML/provider limits still produce explicit errors when exceeded.
