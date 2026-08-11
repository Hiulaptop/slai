## ADDED Requirements

### Requirement: Structured presentation rendering and download
The system SHALL expose owner-authorized rendering and standalone download for a completed structured presentation without persisting the generated HTML.

#### Scenario: Render owned presentation
- **WHEN** the authenticated owner requests rendered output for a completed presentation
- **THEN** the system resolves the current structured revision and returns safe complete HTML without changing presentation or revision state

#### Scenario: Download owned presentation
- **WHEN** the authenticated owner requests the presentation download
- **THEN** the system returns rendered `text/html` as an attachment with standalone navigation and no remote runtime dependency

#### Scenario: Render missing or non-owned presentation
- **WHEN** the presentation does not exist or belongs to another user
- **THEN** the system returns the same status `404` response and renders nothing

## MODIFIED Requirements

### Requirement: Owned presentation detail
The system SHALL expose `GET /api/slides/{generationId}` to return the authenticated owner's current presentation state using a safe detail DTO.

#### Scenario: Retrieve owned completed presentation
- **WHEN** the owner requests a valid completed presentation ID
- **THEN** the system returns status `200` with ID, title, status, approved outline, current structured document, current revision number, provider/model metadata, finish reason, token usage, and lifecycle timestamps without embedding rendered HTML

#### Scenario: Retrieve owned in-progress or failed presentation
- **WHEN** the owner requests their pending, processing, or failed presentation
- **THEN** the system returns status `200` with its lifecycle status and nullable unavailable structured output fields

#### Scenario: Missing or non-owned detail
- **WHEN** the ID does not exist or belongs to another user
- **THEN** the system returns status `404` with the same error body

#### Scenario: Invalid detail ID
- **WHEN** `generationId` is not a valid UUID
- **THEN** the system returns status `400` without querying an unscoped presentation

### Requirement: Owned presentation deletion
The system SHALL expose `DELETE /api/slides/{generationId}` to permanently remove an owned non-processing presentation and its structured revision graph.

#### Scenario: Delete owned presentation
- **WHEN** the owner deletes a pending, completed, or failed presentation
- **THEN** the system atomically deletes it, cascades its revision compositions and exclusively owned structured data, and returns status `204` with no response body

#### Scenario: Delete processing presentation
- **WHEN** the owner attempts to delete a presentation whose status is `PROCESSING`
- **THEN** the system returns status `409` and leaves the presentation and revisions unchanged

#### Scenario: Missing or non-owned deletion
- **WHEN** the presentation does not exist or belongs to another user
- **THEN** the system returns status `404` with the same error body and deletes nothing

#### Scenario: Concurrent deletion state change
- **WHEN** presentation ownership or lifecycle state changes between authorization and deletion
- **THEN** the conditional delete fails with status `409` and does not delete a newly prohibited record

### Requirement: Operation-specific presentation state
The shared presentation access policy SHALL enforce lifecycle requirements independently from ownership.

#### Scenario: Read any owned lifecycle state
- **WHEN** an owner lists or retrieves a presentation in any lifecycle state
- **THEN** the policy permits read access

#### Scenario: Mutate completed presentation
- **WHEN** an owner edits or undoes a `COMPLETED` presentation with a valid current structured revision
- **THEN** the policy permits mutation access

#### Scenario: Mutate incomplete presentation
- **WHEN** an owner attempts to edit or undo a pending, processing, failed, or structurally incomplete presentation
- **THEN** the system returns status `409` without invoking the AI provider or mutating revisions

### Requirement: Approved outline generation
The system SHALL generate a presentation only from a valid user-approved outline supplied together with the source report and visual template.

#### Scenario: Successful presentation generation
- **WHEN** an authenticated user submits valid `report`, `template`, and `outline` multipart fields to `POST /api/slides/generate`
- **THEN** the system creates an owned generation, sends all three inputs under the generation system prompt, validates and stores structured revision 1, and returns status `201` with the generation ID, outline, structured document, status, and provider metadata

#### Scenario: Invalid approved outline
- **WHEN** the approved outline has extra keys, invalid lengths, duplicate/non-contiguous numbers, or more than 50 slides
- **THEN** the system returns status `400` without creating a generation or calling the AI provider

#### Scenario: Generation provider failure
- **WHEN** the provider request or structured output validation fails after a generation row is created
- **THEN** the system marks the generation `FAILED`, stores a stable non-sensitive error, and returns status `502`

### Requirement: Template and report fidelity prompt
The system SHALL use a centralized generation system prompt requiring factual content from the report, slide order/content intent from the approved outline, visual language from the template, and output conforming to the registered structured slide document schema.

#### Scenario: Generation prompt construction
- **WHEN** the generation service constructs an AI request
- **THEN** the system message defines the exact structured document contract, forbids Markdown and executable or remote content, identifies uploaded files as untrusted source data, and requires adherence to both report content and template design

### Requirement: Batch slide editing
The system SHALL expose one batch-edit route that accepts a generation ID and a JSON array of numbered slide instructions, updates exactly the selected structured slides, and preserves non-target slide references.

#### Scenario: Successful batch edit
- **WHEN** the owner sends `{ "generationId": "...", "edits": [{ "slideNumber": 2, "prompt": "..." }] }` to `PATCH /api/slides/edit` with one or more unique existing slide numbers
- **THEN** the system requests one structured replacement for each item, validates all replacements, applies them atomically, appends one `EDIT` revision for the batch, and returns status `200` with the updated structured document and revision metadata

#### Scenario: Invalid edit request
- **WHEN** `edits` is empty or exceeds 50 items, an item has extra keys, a prompt is blank or longer than 2,000 characters, slide numbers are duplicate or nonexistent, or the generation is incomplete
- **THEN** the system returns status `400`, `404`, or `409` as appropriate without calling or persisting model output

#### Scenario: Invalid edit model response
- **WHEN** the model returns invalid JSON, a missing or additional slide, a duplicate or wrong slide number, an unsupported element, an invalid graph, executable content, or malformed structured data
- **THEN** the system returns status `502`, applies none of the batch, and preserves the current structured revision pointer

#### Scenario: Non-target preservation
- **WHEN** a batch edit succeeds
- **THEN** every slide absent from the request retains the same immutable slide snapshot ID, order, and structured content

#### Scenario: Multiple requested slides
- **WHEN** a valid edit request contains instructions for multiple slides
- **THEN** each selected slide is replaced according to its corresponding prompt and all replacements are committed in one revision

### Requirement: Revision history and undo
The system SHALL preserve immutable structurally shared revisions and maintain a current revision pointer that supports repeated undo and editing after undo.

#### Scenario: Undo a changed slide
- **WHEN** the owner calls `POST /api/slides/{generationId}/undo` for an undoable slide in the current revision
- **THEN** the system appends an `UNDO` revision that restores the prior immutable snapshot for that slide, preserves non-target slide references and all historical revisions, and returns status `200`

#### Scenario: Nothing to undo
- **WHEN** the selected slide has no prior differing snapshot in the revision ancestry
- **THEN** the system returns status `409` without changing structured data or revision history

#### Scenario: Edit after undo
- **WHEN** the user undoes to earlier slide content and then submits another edit batch
- **THEN** the system creates a new monotonically numbered revision whose parent is the undo revision without overwriting the abandoned branch

#### Scenario: Concurrent stale mutation
- **WHEN** concurrent design save, batch edit, or undo operations attempt to change the same current revision
- **THEN** exactly one compare-and-swap update succeeds and stale operations return status `409` without reachable or orphaned revisions

### Requirement: Slide generation persistence
The system SHALL store owned generation state, approved outline, current structured revision pointer, provider metadata, token usage, lifecycle timestamps, and structurally shared revision history without storing uploaded file bytes, base64 file payloads, or rendered presentation HTML.

#### Scenario: Persisted request metadata
- **WHEN** generation begins
- **THEN** `requestPayload` contains file names, MIME types, byte sizes, and approved outline but excludes raw file data

#### Scenario: Completed generation metadata
- **WHEN** generation succeeds
- **THEN** the system stores status `COMPLETED`, finish reason, token usage, completion time, current revision, next revision allocator, and structured revision composition without a full HTML snapshot

## REMOVED Requirements

### Requirement: Presentation HTML contract
**Reason**: Complete HTML is replaced as the generated and persisted source-of-truth contract by the versioned structured slide document and deterministic render-on-demand capability.

**Migration**: Generation and edit prompts produce structured data; compatible historical design HTML is converted and verified, unsupported legacy HTML remains on an explicit read-only path until an approved disposition exists, and HTML columns are removed only after migration gates pass.
