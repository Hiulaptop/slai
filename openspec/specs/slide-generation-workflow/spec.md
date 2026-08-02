## Purpose

Define an authenticated, provider-neutral workflow for suggesting slide outlines, generating and editing validated HTML presentations, and preserving owned revision history.

## Requirements

### Requirement: Authenticated slide operations
The system MUST require valid bearer authentication for outline, generation, list, detail, edit, undo, and delete routes and MUST authorize stored presentation operations through a shared owner-only access policy.

#### Scenario: Authenticated owner request
- **WHEN** an active authenticated user invokes a permitted slide operation for their own presentation
- **THEN** the system performs the requested operation subject to input and lifecycle-state validation

#### Scenario: Unauthenticated request
- **WHEN** any slide route receives no valid bearer access token
- **THEN** the system returns status `401` without reading or mutating presentation data or calling the AI provider

#### Scenario: Different owner
- **WHEN** an authenticated user requests, edits, undoes, or deletes another user's presentation
- **THEN** the system returns the same status `404` response used for a nonexistent presentation and does not reveal ownership or lifecycle data

#### Scenario: Shared policy enforcement
- **WHEN** detail, edit, undo, or delete resolves presentation access
- **THEN** the application uses the same owner-scoped access policy with the operation's required lifecycle state

### Requirement: Owner presentation listing
The system SHALL expose `GET /api/slides` to return a stable cursor-paginated list containing only presentations owned by the authenticated user.

#### Scenario: First list page
- **WHEN** an authenticated user requests `GET /api/slides` without pagination parameters
- **THEN** the system returns status `200` with up to 20 owned items ordered by creation time and ID descending plus a nullable `nextCursor`

#### Scenario: Custom page size
- **WHEN** the caller supplies an integer `limit` from 1 through 50
- **THEN** the system returns at most that number of owned items

#### Scenario: Next list page
- **WHEN** the caller supplies a valid cursor returned by a previous page
- **THEN** the system returns the next owned items after that cursor without duplicating rows from the prior page

#### Scenario: Invalid pagination input
- **WHEN** `limit` is outside 1 through 50 or `cursor` is malformed or schema-invalid
- **THEN** the system returns status `400`

#### Scenario: Ownership isolation
- **WHEN** multiple users have presentations
- **THEN** a user's list and cursor traversal never contain or use another user's presentation rows

### Requirement: Presentation list summaries
The system MUST keep list items bounded and MUST exclude presentation bodies and sensitive generation data.

#### Scenario: List item serialization
- **WHEN** a presentation appears in a list response
- **THEN** the item contains only ID, title, status, current revision number, creation time, update time, and completion time

#### Scenario: Large field exclusion
- **WHEN** a list response is serialized
- **THEN** it excludes HTML, approved outline, request/response payloads, error details, token usage, provider/model metadata, ownership ID, and revision snapshots

### Requirement: Owned presentation detail
The system SHALL expose `GET /api/slides/{generationId}` to return the authenticated owner's current presentation state using a safe detail DTO.

#### Scenario: Retrieve owned completed presentation
- **WHEN** the owner requests a valid completed presentation ID
- **THEN** the system returns status `200` with ID, title, status, approved outline, current HTML, current revision number, provider/model metadata, finish reason, token usage, and lifecycle timestamps

#### Scenario: Retrieve owned in-progress or failed presentation
- **WHEN** the owner requests their pending, processing, or failed presentation
- **THEN** the system returns status `200` with its lifecycle status and nullable unavailable output fields

#### Scenario: Missing or non-owned detail
- **WHEN** the ID does not exist or belongs to another user
- **THEN** the system returns status `404` with the same error body

#### Scenario: Invalid detail ID
- **WHEN** `generationId` is not a valid UUID
- **THEN** the system returns status `400` without querying an unscoped presentation

### Requirement: Owned presentation deletion
The system SHALL expose `DELETE /api/slides/{generationId}` to permanently remove an owned non-processing presentation and its revision snapshots.

#### Scenario: Delete owned presentation
- **WHEN** the owner deletes a pending, completed, or failed presentation
- **THEN** the system atomically deletes it, cascades its slide revisions, and returns status `204` with no response body

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
- **WHEN** an owner edits or undoes a `COMPLETED` presentation with current HTML and revision state
- **THEN** the policy permits mutation access

#### Scenario: Mutate incomplete presentation
- **WHEN** an owner attempts to edit or undo a pending, processing, failed, or structurally incomplete presentation
- **THEN** the system returns status `409` without invoking the AI provider or mutating revisions

### Requirement: Stable owner list pagination
The system MUST paginate owned presentations deterministically by `(createdAt DESC, id DESC)` with an opaque validated cursor and an owner-compatible database index.

#### Scenario: Creation-time tie
- **WHEN** two owned presentations share the same creation timestamp
- **THEN** descending ID order provides a deterministic boundary with no duplicate or missing item across pages

#### Scenario: Tampered cursor
- **WHEN** a cursor cannot be decoded into a valid creation timestamp and UUID
- **THEN** the system returns status `400` and does not treat cursor contents as authorization

### Requirement: Report outline suggestion
The system SHALL accept a report file, send it to the configured AI adapter with the outline system prompt, and return a strictly validated JSON outline for user review.

#### Scenario: Successful outline suggestion
- **WHEN** an authenticated user uploads a valid report file to `POST /api/slides/outline`
- **THEN** the system returns status `200` with a title and 1 through 50 contiguously numbered slide objects containing `number`, `title`, and `summary`

#### Scenario: Invalid report upload
- **WHEN** the report is missing, empty, unsupported, or larger than 10 MiB
- **THEN** the system returns status `400` without calling the AI provider

#### Scenario: Invalid outline model response
- **WHEN** the model response is not valid JSON or violates the outline schema
- **THEN** the system returns status `502` and does not present the response as a usable outline

### Requirement: Approved outline generation
The system SHALL generate a presentation only from a valid user-approved outline supplied together with the source report and visual template.

#### Scenario: Successful presentation generation
- **WHEN** an authenticated user submits valid `report`, `template`, and `outline` multipart fields to `POST /api/slides/generate`
- **THEN** the system creates an owned generation, sends all three inputs under the generation system prompt, stores validated HTML and revision 1, and returns status `201` with the generation ID, outline, HTML, status, and provider metadata

#### Scenario: Invalid approved outline
- **WHEN** the approved outline has extra keys, invalid lengths, duplicate/non-contiguous numbers, or more than 50 slides
- **THEN** the system returns status `400` without creating a generation or calling the AI provider

#### Scenario: Generation provider failure
- **WHEN** the provider request or output validation fails after a generation row is created
- **THEN** the system marks the generation `FAILED`, stores a stable non-sensitive error, and returns status `502`

### Requirement: Presentation HTML contract
The system MUST accept and persist only sanitized complete HTML5 presentations whose slides match the approved outline and use the required wrapper contract.

#### Scenario: Valid presentation HTML
- **WHEN** model output contains one complete document and exactly one wrapper per approved slide using `<div class="slai-slide" data-slide-number="N">`
- **THEN** the system sanitizes and stores the document when wrapper numbers are unique, contiguous, one-based, non-nested, and equal the approved outline length

#### Scenario: Invalid presentation structure
- **WHEN** output contains Markdown fences, scripts, missing document elements, nested/missing/duplicate slide wrappers, non-contiguous numbers, or a wrapper count different from the outline
- **THEN** the system rejects the output, stores no completed HTML revision, and returns status `502`

#### Scenario: Oversized HTML output
- **WHEN** sanitized presentation HTML exceeds 5 MiB
- **THEN** the system rejects the output and returns status `502`

### Requirement: Template and report fidelity prompt
The system SHALL use a centralized generation system prompt requiring factual content from the report, slide order/content intent from the approved outline, and visual language from the template.

#### Scenario: Generation prompt construction
- **WHEN** the generation service constructs an AI request
- **THEN** the system message defines the exact HTML wrapper contract, forbids Markdown and external scripts, identifies uploaded files as untrusted source data, and requires adherence to both report content and template design

### Requirement: Batch slide editing
The system SHALL expose one batch-edit route that accepts a generation ID and a JSON array of numbered slide instructions, updates exactly the selected slides, and preserves the complete document structure.

#### Scenario: Successful batch edit
- **WHEN** the owner sends `{ "generationId": "...", "edits": [{ "slideNumber": 2, "prompt": "..." }] }` to `PATCH /api/slides/edit` with one or more unique existing slide numbers
- **THEN** the system requests exactly one replacement wrapper for each item, validates all replacements, applies them atomically, appends one `EDIT` revision for the batch, and returns status `200` with updated HTML and revision metadata

#### Scenario: Invalid edit request
- **WHEN** `edits` is empty or exceeds 50 items, an item has extra keys, a prompt is blank or longer than 2,000 characters, slide numbers are duplicate or nonexistent, or the generation is incomplete
- **THEN** the system returns status `400`, `404`, or `409` as appropriate without calling or persisting model output

#### Scenario: Invalid edit model response
- **WHEN** the model returns invalid JSON, a full document, a missing or additional slide, a duplicate or wrong slide number, active content, or malformed replacement HTML
- **THEN** the system returns status `502`, applies none of the batch, and preserves the current HTML and revision pointer

#### Scenario: Non-target preservation
- **WHEN** a batch edit succeeds
- **THEN** every slide absent from the request remains unchanged in content, order, wrapper number, and styling

#### Scenario: Multiple requested slides
- **WHEN** a valid edit request contains instructions for multiple slides
- **THEN** each selected slide is replaced according to its corresponding prompt and all replacements are committed in one revision

### Requirement: Revision history and undo
The system SHALL preserve immutable full-HTML revision snapshots and maintain a current revision pointer that supports repeated undo and editing after undo.

#### Scenario: Undo latest edit
- **WHEN** the owner calls `POST /api/slides/{generationId}/undo` and the current revision has a parent
- **THEN** the system restores the parent HTML, moves the current pointer to the parent, preserves all revision rows, and returns status `200`

#### Scenario: Nothing to undo
- **WHEN** the current revision is the initial generated revision or has no parent
- **THEN** the system returns status `409` without changing HTML or revision history

#### Scenario: Edit after undo
- **WHEN** the user undoes to an earlier revision and then submits another edit batch
- **THEN** the system creates a new monotonically numbered revision whose parent is the restored revision without overwriting the abandoned branch

#### Scenario: Concurrent stale mutation
- **WHEN** concurrent batch edit or undo operations attempt to change the same current revision
- **THEN** exactly one compare-and-swap update succeeds and stale operations return status `409` without orphan revisions

### Requirement: Slide generation persistence
The system SHALL store owned generation state, approved outline, current sanitized HTML, provider metadata, token usage, lifecycle timestamps, and revision history without storing uploaded file bytes or base64.

#### Scenario: Persisted request metadata
- **WHEN** generation begins
- **THEN** `requestPayload` contains file names, MIME types, byte sizes, and approved outline but excludes raw file data

#### Scenario: Completed generation metadata
- **WHEN** generation succeeds
- **THEN** the system stores status `COMPLETED`, HTML, finish reason, token usage, completion time, current revision, and next revision allocator

### Requirement: Provider-neutral AI integration
The system SHALL select one configured CLIProxy adapter at the server composition boundary and SHALL keep slide routes independent of OpenAI/Gemini payload details.

#### Scenario: Valid provider configuration
- **WHEN** provider, base URL, API key, and model environment values are valid
- **THEN** the composition root creates the matching adapter and slide services use its normalized generation interface

#### Scenario: Invalid provider configuration
- **WHEN** required AI configuration is absent or the provider is unsupported
- **THEN** initialization fails with a clear configuration error without including the API key

#### Scenario: JSON response mode
- **WHEN** outline generation requests `json_object`
- **THEN** OpenAI and Gemini adapters map the normalized format to their provider-specific JSON response configuration
