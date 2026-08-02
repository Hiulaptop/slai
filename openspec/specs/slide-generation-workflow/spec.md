## Purpose

Define an authenticated, provider-neutral workflow for suggesting slide outlines, generating and editing validated HTML presentations, and preserving owned revision history.

## Requirements

### Requirement: Authenticated slide operations
The system MUST require valid bearer authentication for outline, generation, edit, and undo routes and MUST restrict stored presentation access to its owning user.

#### Scenario: Authenticated owner request
- **WHEN** an active authenticated user invokes a slide route for their own presentation
- **THEN** the system performs the requested operation subject to input validation

#### Scenario: Unauthenticated request
- **WHEN** a slide route receives no valid bearer access token
- **THEN** the system returns status `401` without calling the AI provider

#### Scenario: Different owner
- **WHEN** an authenticated user attempts to edit or undo another user's presentation
- **THEN** the system returns status `404` without exposing that the presentation exists

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
