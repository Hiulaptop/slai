## MODIFIED Requirements

### Requirement: Report outline suggestion
The system SHALL accept creation metadata and repeated data files, send only those authoritative data files to the configured AI adapter with the outline system prompt, and return a strictly validated JSON outline for user review.

#### Scenario: Successful outline suggestion
- **WHEN** an authenticated user submits title, prompt, a positive slide count, and one or more valid data files to `POST /api/slides/outline`
- **THEN** the system returns status `200` with the requested number of contiguously numbered slide objects containing `number`, `title`, and `summary`

#### Scenario: Outline excludes visual templates
- **WHEN** outline suggestion calls the configured AI adapter
- **THEN** the request includes all data files and excludes every template file

#### Scenario: Invalid outline request
- **WHEN** metadata, slide count, required file groups, an individual file, aggregate request size, or serialized request exceeds configured input limits
- **THEN** the system returns status `400` without calling the AI provider

#### Scenario: Invalid outline model response
- **WHEN** the model response is not valid JSON, has a slide count different from the request, or violates the outline schema
- **THEN** the system returns status `502` and does not present the response as a usable outline

### Requirement: Approved outline generation
The system SHALL generate a presentation from title, prompt, all submitted data/template files, and a valid user-approved outline without imposing an arbitrary product-level slide maximum; data files SHALL be the only factual source and template files SHALL be visual references only.

#### Scenario: Successful presentation generation
- **WHEN** an authenticated user submits valid repeated `dataFiles`, repeated `templateFiles`, metadata, and an approved outline to `POST /api/slides/generate`
- **THEN** the system creates an owned generation, sends all inputs under the generation system prompt, stores validated HTML and revision 1, and returns status `201` with generation ID, outline, HTML, status, and provider metadata

#### Scenario: PDF template as page images
- **WHEN** a visual template file is a PDF
- **THEN** the generation prompt instructs the model to treat its pages as an ordered collection of rendered image references and imitate visual patterns without copying factual content

#### Scenario: No invented data
- **WHEN** the model produces slide content
- **THEN** every factual claim, name, date, label, and number comes from data files, and absent facts are omitted or identified as unavailable rather than invented or inferred from templates

#### Scenario: Invalid approved outline
- **WHEN** the approved outline has extra keys, invalid lengths, duplicate/non-contiguous numbers, a count different from `slideCount`, or cannot fit configured operational limits
- **THEN** the system returns status `400` without creating a generation or calling the AI provider

#### Scenario: Generation provider or output limit failure
- **WHEN** the provider cannot accept the aggregate inputs, exceeds its context/runtime limit, or returns HTML that exceeds configured output limits
- **THEN** the system marks the generation `FAILED`, stores a stable non-sensitive error, and returns status `502`

### Requirement: Presentation HTML contract
The system MUST accept and persist only sanitized complete HTML5 presentations whose slide wrappers match the approved outline count, subject to configured output-size and runtime limits rather than a fixed 50-slide ceiling.

Generated presentations SHALL use self-contained HTML and CSS only. JavaScript, scripts, event handlers, forms, iframes, embeds, external stylesheets, CSS imports, undefined CDN utility classes, and external executable content are not permitted. At least one non-empty `<style>` element is required in the document head. The persisted document SHALL include enforced CSS constraints for a fixed slide viewport: the document and each slide wrapper use `width: 100%`, `height: 100%`, `box-sizing: border-box`, and `overflow: hidden`.

#### Scenario: Valid presentation HTML
- **WHEN** model output contains one complete document and exactly one wrapper per approved slide using `<div class="slai-slide" data-slide-number="N">`
- **THEN** the system sanitizes and stores the document when wrapper numbers are unique, contiguous, one-based, non-nested, and equal the approved outline length

#### Scenario: CSS-only bounded slide layout
- **WHEN** generated HTML is accepted
- **THEN** the stored document contains no JavaScript and each slide is bounded to the full viewport without scrollbars or wrapper overflow

#### Scenario: Self-contained CSS
- **WHEN** generated HTML depends on visual styling
- **THEN** all required CSS is present in non-empty head `<style>` elements and rendering does not depend on external stylesheets, CSS imports, Tailwind CDN, or script-generated styles

#### Scenario: Invalid presentation structure
- **WHEN** output contains Markdown fences, scripts, missing document elements, nested/missing/duplicate slide wrappers, non-contiguous numbers, or a wrapper count different from the outline
- **THEN** the system rejects the output, stores no completed HTML revision, and returns status `502`

#### Scenario: Oversized HTML output
- **WHEN** sanitized presentation HTML exceeds the configured byte limit
- **THEN** the system rejects the output and returns status `502`

### Requirement: Batch slide editing
The system SHALL expose one batch-edit route that accepts a generation ID and a JSON array of uniquely numbered slide instructions without a fixed 50-item product ceiling, updates exactly the selected slides, and preserves the complete document structure.

#### Scenario: Successful batch edit
- **WHEN** the owner sends a valid batch containing one or more existing slide numbers to `PATCH /api/slides/edit`
- **THEN** the system requests exactly one replacement wrapper for each item, validates all replacements, applies them atomically, appends one `EDIT` revision for the batch, and returns status `200`

#### Scenario: Invalid edit request
- **WHEN** `edits` is empty, an item has extra keys, a prompt is blank, slide numbers are duplicate/nonexistent, the generation is incomplete, or the request exceeds configured limits
- **THEN** the system returns `400`, `404`, or `409` as appropriate without calling or persisting model output

#### Scenario: Invalid edit model response
- **WHEN** the model returns invalid JSON, a full document, a missing/additional slide, a duplicate/wrong slide number, active content, or malformed replacement HTML
- **THEN** the system returns status `502`, applies none of the batch, and preserves the current HTML and revision pointer

#### Scenario: Non-target preservation
- **WHEN** a batch edit succeeds
- **THEN** every slide absent from the request remains unchanged in content, order, wrapper number, and styling

### Requirement: Revision history and undo
The system SHALL preserve immutable full-HTML revision snapshots and maintain a current revision pointer that supports batch editing and per-slide undo without mutating or deleting prior revision rows.

#### Scenario: Undo latest version of one slide
- **WHEN** the owner calls `POST /api/slides/{generationId}/undo` with a slide number that has a parent version
- **THEN** the system restores only that wrapper, leaves other current wrappers unchanged, creates an `UNDO` revision whose parent is the current revision, and returns status `200`

#### Scenario: Nothing to undo for one slide
- **WHEN** the selected slide has no earlier version or the presentation is not mutable
- **THEN** the system returns status `409` without changing HTML or revision history

#### Scenario: Repeated per-slide undo
- **WHEN** the owner repeats undo for a selected slide
- **THEN** the system walks that slide's immutable prior versions one at a time and never rolls back unrelated slides

#### Scenario: Edit after per-slide undo
- **WHEN** the user undoes one slide and then submits another edit batch
- **THEN** the system creates a new monotonically numbered revision whose parent is the restored current revision without overwriting abandoned snapshots

#### Scenario: Concurrent stale mutation
- **WHEN** concurrent batch edit or per-slide undo operations attempt to change the same current revision
- **THEN** exactly one compare-and-swap update succeeds and stale operations return `409` without orphan revisions
