## 1. Revision Schema and Domain Contracts

- [x] 1.1 Add `UNDO` to the slide revision operation enum, add nullable changed-slide metadata to revisions, create the Prisma migration, and regenerate the client
- [x] 1.2 Replace fixed 50-slide schema ceilings with positive contiguous/count-matched validation and add creation metadata, repeated-file, batch-edit, and per-slide undo request schemas
- [x] 1.3 Add domain tests proving counts and slide numbers above 50 are accepted while zero, non-integer, non-contiguous, mismatched, duplicate, and operationally oversized requests are rejected
- [x] 1.4 Extend presentation detail DTOs/types with per-slide undo availability and update API documentation contracts used by the frontend

## 2. Multi-File Creation Backend

- [x] 2.1 Implement repeated multipart file extraction, per-file validation, aggregate upload budgeting, and metadata serialization for data/template arrays
- [x] 2.2 Update outline and generation prompt builders to include title, user prompt, requested count, data files, and visual template files while preserving provider-neutral content parts
- [x] 2.3 Refactor slide service ports and outline/generation application methods around a shared creation input and validate exact outline-count fidelity
- [x] 2.4 Update `POST /api/slides/outline` and `POST /api/slides/generate` to parse the new multipart contracts and return stable input/provider-limit errors
- [x] 2.5 Add service and route tests for repeated files, missing groups, metadata/count validation, aggregate limits, all input propagation, generation persistence, and provider/output failures

## 3. Per-Slide Editing and Undo Backend

- [x] 3.1 Remove fixed batch-size/slide-number ceilings while retaining prompt, uniqueness, existence, request-budget, and atomic replacement validation
- [x] 3.2 Record changed slide numbers on generated, edited, and undo revisions and expose repository operations needed to resolve prior per-slide versions
- [x] 3.3 Implement transactional per-slide undo that restores one wrapper into current HTML, appends an immutable `UNDO` revision, and uses current-revision compare-and-swap
- [x] 3.4 Change `POST /api/slides/{generationId}/undo` to accept a validated slide number and return updated detail/undo availability
- [x] 3.5 Add HTML, repository, service, and route tests for non-target preservation, repeated per-slide undo, no-prior-version conflict, edit-after-undo, ownership isolation, and stale concurrency

## 4. Slide Creation Frontend

- [x] 4.1 Replace the `/slides/new` placeholder with a responsive phased workspace and shared creation types/state for inputs, outline review, and generation
- [x] 4.2 Implement accessible title, no-max positive slide-count, prompt, multi-data-file, and multi-template-file controls with file lists, removal, per-file validation, and aggregate feedback
- [x] 4.3 Implement the authenticated outline request with pending/error/retry behavior that preserves all entered inputs
- [x] 4.4 Implement editable outline title/slide cards with contiguous numbering, validation, and navigation back to the input phase without losing files
- [x] 4.5 Implement generation submission with the approved outline and original inputs, duplicate-submit prevention, progress feedback, failure recovery, and navigation to `/slides/{generationId}`
- [x] 4.6 Add creation UI tests for input validation, multiple-file management, counts above 50, multipart payloads, outline editing, phase transitions, retry, and successful editor navigation

## 5. Presentation Editor Frontend

- [x] 5.1 Add protected `/slides/[generationId]` detail loading with completed, pending/failed, not-found, generic-error, and retry states
- [x] 5.2 Implement client slide extraction and a script-disabled sandboxed iframe viewport that renders one wrapper without injecting provider HTML into the parent document
- [x] 5.3 Implement keyboard-accessible previous/next and thumbnail navigation with selected-slide and revision metadata
- [x] 5.4 Implement per-slide feedback drafts that survive navigation and one Send feedback action that submits all trimmed non-empty drafts atomically
- [x] 5.5 Apply successful batch responses to the viewer, preserve HTML/drafts on failure, clear only submitted drafts on success, and communicate mutation progress/conflicts
- [x] 5.6 Add per-slide Undo controls driven by undo availability, preserve feedback drafts during undo, and refresh HTML/revision state after success
- [x] 5.7 Add editor UI tests for safe iframe attributes, slide navigation, draft preservation, batch payloads, empty submission, success/failure updates, undo states, and protected detail errors

## 6. Library Integration and Verification

- [x] 6.1 Make presentation summary cards navigate to `/slides/{generationId}` while preserving status metadata, pagination, error-state creation access, and keyboard interaction
- [x] 6.2 Add dashboard regression tests for completed and non-completed editor links plus existing create/list states
- [x] 6.3 Run Prisma validation/generation, migrations against a test database, lint, TypeScript, all tests, OpenSpec validation, and production build
- [x] 6.4 Browser-verify desktop/mobile creation, multi-file selection, outline editing, long-request progress, generated editor navigation, per-slide drafts, one batch send, undo isolation, keyboard focus, sandboxing, and error recovery
