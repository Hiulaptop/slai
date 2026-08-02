## Context

The protected `/slides/new` route is currently a placeholder. Backend routes already support report-only outline suggestion, single-report/single-template generation, batch edit, presentation detail, and whole-presentation undo. The existing frontend keeps access tokens in memory and uses a client protected shell, which this change must preserve.

The current backend has hard limits of 50 slides, 10 MiB per upload, and 5 MiB sanitized HTML. The requested product behavior removes the arbitrary slide-count ceiling, but provider context windows, request body limits, generation timeouts, and HTML storage remain physical constraints. Existing revision rows store full HTML snapshots and a parent revision number, but do not identify per-slide history or use an `UNDO` operation.

## Goals / Non-Goals

**Goals:**

- Implement the complete protected create-to-editor browser flow.
- Support title, prompt, positive slide count, multiple data files, and multiple template files.
- Let users review and edit every outline item before generation.
- Generate from the approved outline and original input set in one provider call.
- Render sanitized generated HTML one slide at a time without executing provider content.
- Collect per-slide feedback and submit all drafts in one atomic batch edit.
- Restore one slide at a time with immutable revision history and clear concurrency behavior.
- Keep completed dashboard cards linked to the editor and provide loading/error/retry states.

**Non-Goals:**

- Add arbitrary HTML authoring, drag-and-drop layout editing, theme authoring, or slide insertion/deletion in the editor.
- Stream partial outline or HTML output; requests return only after the existing provider adapter completes.
- Persist unfinished browser form drafts or uploaded file bytes on the server.
- Support collaborative multi-user editing, comments/mentions, or version comparison UI.
- Make physically impossible provider requests succeed; oversized/context-exceeding requests fail with actionable errors.

## Decisions

### Use a phased client workflow with explicit request boundaries

The create page owns phases `inputs -> outline -> generating`, with a stable phase indicator and browser state for metadata, selected files, prompt, count, and editable outline. The outline phase calls `POST /api/slides/outline` once. The generate action calls `POST /api/slides/generate` once using the original files and current outline. A successful response navigates to `/slides/{generationId}`.

This is preferred over one server action because files cannot be persisted safely as a form draft and users need a clear review boundary. A wizard library is unnecessary; native forms and explicit React state keep transitions testable.

### Define multipart contracts for multiple files and metadata

Outline multipart fields:

```text
title: string
prompt: string
slideCount: positive integer
dataFiles: File[] (at least one)
templateFiles: File[] (at least one)
```

Generation multipart fields:

```text
title: string
prompt: string
slideCount: positive integer
outline: JSON
dataFiles: File[]
templateFiles: File[]
```

The server accepts repeated `dataFiles` and `templateFiles` keys and validates every file individually. The outline request passes only normalized data files to the AI. Generation passes both arrays as separate labeled content-part groups: data files are authoritative factual sources, while template files are visual references only. For template PDFs, the generation prompt directs the model to interpret each page as a rendered image in an ordered design-reference collection and forbids using template text or numbers as facts. Existing single-file clients are not preserved unless a concrete shipped consumer requires it; this change updates the frontend and route tests together.

### Remove the arbitrary slide ceiling while preserving operational limits

Change outline, batch edit, and response schemas from `.max(50)` to positive/unbounded arrays, and remove the `max(50)` count from file-independent slide validation. Validate outline numbers as contiguous one-based integers and ensure `slideCount` equals outline length. Enforce a configurable request/provider safety policy based on serialized outline size, file aggregate bytes, provider context capability, generation timeout, and final HTML size. Errors use stable `400` for invalid input or `502` for provider/output limitations and explain the constraint without exposing provider secrets.

The client uses a numeric input with no `max` attribute. It prevents zero/negative/non-integer values and displays server/provider limit errors rather than imposing a product maximum.

### Keep input fidelity and prompt construction provider-neutral

The application service receives a `SlideCreationInput` containing metadata, file arrays, and approved outline. Prompt builders remain centralized and describe title, user prompt, factual data inputs, template references, slide count, and the exact HTML wrapper contract. The adapter receives normalized content parts and remains unaware of route/form names.

### Add a separate editor route and safe slide viewport

Use `/slides/[generationId]` under the existing protected layout. Fetch detail through `authFetch`, parse the HTML with a client-safe slide extraction helper, and render the selected wrapper in a sandboxed iframe using `srcDoc`. The iframe uses `sandbox="allow-same-origin"` without scripts/forms/popups; sanitized server HTML remains the source of truth. Do not use `dangerouslySetInnerHTML` in the parent document. Generation is CSS-only: the prompt requires template-matching CSS and fixed `width:100%; height:100%; overflow:hidden` slide boundaries, while backend and iframe runtime styles enforce the boundary as a final safety layer.

The editor keeps the full HTML in client state only for display/update response handling, tracks selected slide number, and provides keyboard-accessible previous/next and thumbnail buttons. A loading detail state, 404 state, failed-generation state, and retry state are required.

### Draft feedback per slide, submit as one atomic batch

The editor stores `Record<number, string>` feedback drafts. Changing slide selection never clears drafts. A single Send feedback button collects trimmed non-empty entries into the existing `{ generationId, edits }` request and submits one `PATCH /api/slides/edit`. The API validates every selected slide and either commits all replacements as one revision or none. During submission, navigation and feedback fields are disabled; the response replaces the current HTML/revision metadata and clears only submitted drafts.

### Model per-slide undo as a new immutable revision

Add a revision operation `UNDO` and store per-slide provenance in revision metadata. For `slideNumber`, the repository finds the newest ancestor/current-branch snapshot where that slide differs from the current snapshot, replaces only that wrapper in current HTML, and atomically creates a new `UNDO` revision whose parent is the current revision. If no prior version exists, return `409`. This preserves changes in other slides and avoids deleting or mutating immutable rows.

The editor displays Undo on every slide, disabled when the API indicates no prior version. After a successful edit or undo, the detail response includes current HTML/revision and per-slide undo availability. Legacy whole-presentation undo is replaced by the slide-number request contract; no compatibility shim is added because this is an unreleased frontend flow.

### Link completed summaries to the editor

Dashboard cards become links for items with a usable presentation ID, while the existing create action remains unchanged. The editor route is owner-protected by the existing detail/edit/undo policy.

### Test at domain, route, and UI boundaries

Add tests for repeated multipart fields, metadata/count validation, unbounded outline/edit arrays, aggregate upload errors, prompt content parts, slide extraction/sandbox behavior, batch atomicity, per-slide undo branches/concurrency, create phase transitions, outline editing, editor navigation, draft preservation, error/retry, and card navigation. Keep API tests in Node and UI tests in jsdom.

## Risks / Trade-offs

- [Unbounded slide counts can exhaust provider context or server memory] -> Enforce measured aggregate input, serialized outline, timeout, and HTML limits with explicit errors; never use a misleading arbitrary slide maximum.
- [Multiple files increase multipart and provider payload size] -> Validate every file, enforce an aggregate request budget, show names/sizes before submit, and omit raw bytes from persisted metadata.
- [Embedding generated HTML can still present unsafe content] -> Sanitize server-side, extract only wrapper nodes, use `srcDoc` with a restrictive sandbox, and never execute scripts/forms.
- [Per-slide undo requires provenance beyond current full snapshots] -> Store operation metadata and changed slide numbers per immutable revision; use transactional compare-and-swap.
- [Concurrent edits and undo can race] -> Include current revision in the mutation precondition and return `409` without creating orphan revisions on stale writes.
- [Long generation/edit requests may be interrupted] -> Keep explicit pending UI, abort on route teardown where supported, make persisted generation failure stable, and provide detail retry.
- [Existing API consumers expect singular multipart names] -> Update repository-owned routes/tests together and document the new repeated-key contract; do not maintain speculative backward compatibility.

## Migration Plan

1. Add schema/migration support for `UNDO` revisions and per-revision changed-slide metadata.
2. Update domain schemas, upload normalization, prompt construction, service ports, repository implementation, and API routes.
3. Implement create phases and protected editor route using existing auth client and UI primitives.
4. Convert dashboard summaries to editor links and remove the placeholder page.
5. Run migrations, unit/API/UI tests, lint, typecheck, build, and browser verification with small and large realistic fixtures.

Rollback removes the new routes and frontend components, restores singular input parsing, and deploys the prior schema/application version. If the migration has already run, the new nullable revision metadata and `UNDO` enum value are additive; rollback code ignores them, but the migration itself is not destructively reversed.

## Open Questions

None. The product choice is to submit all non-empty slide feedback as one batch and undo one selected slide at a time.
