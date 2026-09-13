## MODIFIED Requirements

### Requirement: Approved outline generation
The system SHALL generate a presentation only from a valid user-approved outline supplied together with the source report and visual template, producing sanitized per-slide HTML/CSS instead of a structured document.

#### Scenario: Successful presentation generation
- **WHEN** an authenticated user submits valid `report`, `template`, and `outline` multipart fields to `POST /api/slides/generate`
- **THEN** the system creates an owned generation, sends all three inputs under the generation system prompt, validates and sanitizes the returned per-slide HTML/CSS, stores revision 1, and returns status `201` with the generation ID, outline, per-slide HTML/CSS, status, and provider metadata

#### Scenario: Invalid approved outline
- **WHEN** the approved outline has extra keys, invalid lengths, duplicate/non-contiguous numbers, or more than 50 slides
- **THEN** the system returns status `400` without creating a generation or calling the AI provider

#### Scenario: Generation provider failure
- **WHEN** the provider request, HTML validation, or sanitization fails after a generation row is created
- **THEN** the system marks the generation `FAILED`, stores a stable non-sensitive error, and returns status `502`

### Requirement: Template and report fidelity prompt
The system SHALL use a centralized generation system prompt requiring factual content from the report, slide order/content intent from the approved outline, visual language from the template, and output as one self-contained HTML/CSS block per slide that passes the system's content-safety sanitization.

#### Scenario: Generation prompt construction
- **WHEN** the generation service constructs an AI request
- **THEN** the system message requires exactly one HTML/CSS block per outline slide, forbids `<script>` content, inline event-handler attributes, and remote or executable content, identifies uploaded files as untrusted source data, and requires adherence to both report content and template design

### Requirement: Batch slide editing
The system SHALL expose one batch-edit route that accepts a generation ID and a JSON array of numbered slide instructions, updates exactly the selected slides' HTML/CSS, and preserves non-target slide references.

#### Scenario: Successful batch edit
- **WHEN** the owner sends `{ "generationId": "...", "edits": [{ "slideNumber": 2, "prompt": "..." }] }` to `PATCH /api/slides/edit` with one or more unique existing slide numbers, where each edit's `prompt` may be a free-text instruction, a directly authored HTML/CSS replacement from the canvas, or both
- **THEN** the system resolves one HTML/CSS replacement for each item (from the AI when a free-text instruction is present, or directly from the submitted canvas HTML/CSS otherwise), validates and sanitizes all replacements, applies them atomically, appends one `EDIT` revision for the batch, and returns status `200` with the updated per-slide HTML/CSS and revision metadata

#### Scenario: Invalid edit request
- **WHEN** `edits` is empty or exceeds 50 items, an item has extra keys, both `prompt` fields are blank, a free-text prompt is longer than 2,000 characters, slide numbers are duplicate or nonexistent, or the generation is incomplete
- **THEN** the system returns status `400`, `404`, or `409` as appropriate without calling or persisting model output

#### Scenario: Invalid edit model response
- **WHEN** the model returns invalid JSON, a missing or additional slide, a duplicate or wrong slide number, HTML/CSS that fails sanitization, or executable content
- **THEN** the system returns status `502`, applies none of the batch, and preserves the current revision pointer

#### Scenario: Invalid directly submitted canvas HTML
- **WHEN** a directly authored HTML/CSS replacement submitted from the canvas fails sanitization or contains executable content
- **THEN** the system returns status `400`, applies none of the batch, and preserves the current revision pointer

#### Scenario: Non-target preservation
- **WHEN** a batch edit succeeds
- **THEN** every slide absent from the request retains the same immutable slide snapshot ID, order, and HTML/CSS content

#### Scenario: Multiple requested slides
- **WHEN** a valid edit request contains instructions for multiple slides
- **THEN** each selected slide is replaced according to its corresponding instruction and all replacements are committed in one revision

### Requirement: Slide generation persistence
The system SHALL store owned generation state, approved outline, current revision pointer, provider metadata, token usage, lifecycle timestamps, and structurally shared per-slide HTML/CSS revision history without storing uploaded file bytes or base64 file payloads.

#### Scenario: Persisted request metadata
- **WHEN** generation begins
- **THEN** `requestPayload` contains file names, MIME types, byte sizes, and approved outline but excludes raw file data

#### Scenario: Completed generation metadata
- **WHEN** generation succeeds
- **THEN** the system stores status `COMPLETED`, finish reason, token usage, completion time, current revision, next revision allocator, and per-slide HTML/CSS revision composition

### Requirement: Revision history and undo
The system SHALL preserve immutable structurally shared per-slide HTML/CSS revisions and maintain a current revision pointer that supports repeated undo and editing after undo.

#### Scenario: Undo a changed slide
- **WHEN** the owner calls `POST /api/slides/{generationId}/undo` for an undoable slide in the current revision
- **THEN** the system appends an `UNDO` revision that restores the prior immutable HTML/CSS snapshot for that slide, preserves non-target slide references and all historical revisions, and returns status `200`

#### Scenario: Nothing to undo
- **WHEN** the selected slide has no prior differing snapshot in the revision ancestry
- **THEN** the system returns status `409` without changing revision content or history

#### Scenario: Edit after undo
- **WHEN** the user undoes to earlier slide content and then submits another edit batch
- **THEN** the system creates a new monotonically numbered revision whose parent is the undo revision without overwriting the abandoned branch

#### Scenario: Concurrent stale mutation
- **WHEN** concurrent design save, batch edit, or undo operations attempt to change the same current revision
- **THEN** exactly one compare-and-swap update succeeds and stale operations return status `409` without reachable or orphaned revisions
