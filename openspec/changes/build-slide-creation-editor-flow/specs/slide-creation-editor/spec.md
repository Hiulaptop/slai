## ADDED Requirements

### Requirement: Protected slide creation inputs
The system SHALL expose `/slides/new` as a protected phased workflow that collects a presentation title, positive requested slide count, user prompt, at least one data file, and at least one template file.

#### Scenario: Anonymous creation visit
- **WHEN** an anonymous user visits `/slides/new`
- **THEN** the protected shell redirects to login with `/slides/new` as the safe intended destination

#### Scenario: Valid creation inputs
- **WHEN** an authenticated user enters a title, positive integer slide count, prompt, valid data files, and valid template files
- **THEN** the workflow allows the user to request an outline

#### Scenario: Invalid creation inputs
- **WHEN** title, prompt, or slide count is invalid or either required file group is empty
- **THEN** the workflow displays field-level feedback and does not call the outline API

#### Scenario: Multiple file selection
- **WHEN** the user selects multiple data or template files
- **THEN** the workflow lists each name and size, validates every file, and allows removing an individual file before submission

#### Scenario: File validation failure
- **WHEN** any selected file is empty, unsupported, exceeds its per-file limit, or causes the aggregate request budget to be exceeded
- **THEN** the workflow identifies the invalid file or budget error and prevents submission

### Requirement: Outline suggestion review
The system SHALL send creation metadata and all selected data files to the outline API without sending template files to the model, and SHALL provide an editable review phase before generation.

#### Scenario: Request outline
- **WHEN** the user submits valid creation inputs
- **THEN** the client sends title, prompt, slide count, and all data files in one authenticated multipart request, and does not include template files

#### Scenario: Outline response
- **WHEN** the outline API returns a valid outline
- **THEN** the workflow displays the proposed presentation title and every slide's title and summary in one-based order

#### Scenario: Edit proposed outline
- **WHEN** the user changes a slide title or summary during review
- **THEN** the edited value remains in the approved outline submitted for generation

#### Scenario: Outline failure
- **WHEN** the outline request or provider response fails
- **THEN** the workflow exits pending state, preserves entered inputs, and displays a retryable error

#### Scenario: No product slide maximum
- **WHEN** the user enters any positive integer count accepted by the operational request/provider limits
- **THEN** the client does not reject it because of an arbitrary product maximum

### Requirement: Approved presentation generation
The system SHALL generate a presentation from the reviewed outline, ground every factual claim exclusively in the original data files, and use template files only as visual design references.

#### Scenario: Generate reviewed deck
- **WHEN** the user submits an edited valid outline
- **THEN** the client sends title, prompt, slide count, approved outline, all data files, and all template files in one authenticated multipart request

#### Scenario: Template PDF visual interpretation
- **WHEN** generation includes a PDF template
- **THEN** the model is instructed to interpret each PDF page as an image-like visual reference for layout, typography, color, hierarchy, and composition, and not as a factual content source

#### Scenario: Factual grounding
- **WHEN** the generated presentation contains claims, names, dates, labels, or numbers
- **THEN** every such item is supported by the supplied data files, and the model does not invent, estimate, extrapolate, or copy facts from template files

#### Scenario: Generation success
- **WHEN** generation returns a completed presentation
- **THEN** the client navigates to `/slides/{generationId}` with the returned sanitized HTML and revision metadata available for editor rendering

#### Scenario: Generation pending
- **WHEN** generation is in progress
- **THEN** the workflow disables duplicate submission and communicates that the provider is working

#### Scenario: Generation failure
- **WHEN** generation fails validation, provider limits, or transport
- **THEN** the workflow keeps the approved outline and input metadata available and displays a retryable non-sensitive error

### Requirement: Protected slide editor
The system SHALL expose `/slides/{generationId}` as an owner-protected editor that displays one generated slide at a time.

The slide viewport SHALL render HTML/CSS only with a fixed full-slide boundary, no scripts, no scrollbars, and no content overflow outside the selected slide wrapper.

The viewport SHALL preserve the source document's body attributes and non-slide ancestor containers while removing non-selected slide wrappers so CSS selectors and variables that depend on the original hierarchy continue to apply in phase 3.

#### Scenario: Download current HTML
- **WHEN** the owner activates Download HTML for a completed presentation
- **THEN** the browser downloads the current full presentation HTML, including the latest successful edit or undo revision, with a safe `.html` filename derived from the title and trusted application-owned standalone navigation

#### Scenario: Navigate downloaded HTML
- **WHEN** the downloaded HTML is opened directly in a browser
- **THEN** it initially shows slide 1, provides Previous and Next controls, supports ArrowLeft and ArrowRight, displays one slide at a time, and does not depend on the SLAI application runtime

#### Scenario: Load completed presentation
- **WHEN** the owner opens a completed presentation editor
- **THEN** the editor fetches the detail DTO, shows the selected slide in a safe sandboxed viewport, and displays navigation controls

#### Scenario: Slide navigation
- **WHEN** the user activates previous, next, or a slide thumbnail
- **THEN** the editor changes the selected slide without changing slide content or feedback drafts

#### Scenario: Keyboard slide navigation
- **WHEN** the editor has focus outside a text-entry control and the user presses ArrowLeft or ArrowRight
- **THEN** ArrowLeft selects the previous slide and ArrowRight selects the next slide; boundary keys do nothing

#### Scenario: Text-entry arrow keys
- **WHEN** the user presses an arrow key inside feedback or another text-entry control
- **THEN** the editor preserves the native text-entry behavior and does not change the selected slide

#### Scenario: Editor loading and retry
- **WHEN** detail loading fails for a retryable reason
- **THEN** the editor displays an error and Retry action without rendering untrusted HTML in the parent document

#### Scenario: Missing or non-owned presentation
- **WHEN** the detail API returns `404`
- **THEN** the editor displays a not-found state without revealing whether the ID exists for another user

#### Scenario: Failed generation detail
- **WHEN** a presentation has failed generation status
- **THEN** the editor displays its failure state and does not render an absent HTML document

### Requirement: Per-slide feedback batch editing
The editor SHALL preserve a feedback draft for each slide and submit all non-empty drafts in one atomic request.

#### Scenario: Draft feedback
- **WHEN** the user enters feedback for the selected slide and navigates to another slide
- **THEN** the draft remains associated with its original slide number

#### Scenario: Submit all feedback
- **WHEN** the user activates Send feedback with one or more non-empty drafts
- **THEN** the client sends one batch edit request containing exactly those slide numbers and prompts

#### Scenario: Empty feedback submission
- **WHEN** every feedback draft is blank
- **THEN** the editor prevents submission and asks the user to enter at least one instruction

#### Scenario: Batch edit pending
- **WHEN** feedback is being processed
- **THEN** the editor disables feedback/navigation mutation controls and shows progress

#### Scenario: Batch edit success
- **WHEN** the batch edit API returns the updated presentation
- **THEN** the editor replaces current HTML/revision metadata and clears only the submitted drafts

#### Scenario: Batch edit failure
- **WHEN** batch edit returns `400`, `409`, `502`, or a network failure
- **THEN** the editor preserves current HTML and all drafts and displays a retryable error

### Requirement: Per-slide undo
The system SHALL provide an undo action for each slide that restores only that slide's previous content through an immutable revision.

#### Scenario: Undo selected slide
- **WHEN** the user activates Undo on slide N and a prior version exists for N
- **THEN** the server restores only slide N, preserves current content of every other slide, creates an immutable `UNDO` revision, and returns the updated presentation

#### Scenario: Undo unavailable
- **WHEN** slide N has no prior version in the current revision history
- **THEN** the Undo control is disabled or the API returns `409` without changing the presentation

#### Scenario: Repeated per-slide undo
- **WHEN** the user repeatedly undoes slide N
- **THEN** each successful undo moves N to its next earlier version without removing revision rows or changing other slides

#### Scenario: Stale undo
- **WHEN** another edit or undo changes the current revision before an undo commits
- **THEN** the undo returns `409` and creates no orphan revision

#### Scenario: Undo pending state
- **WHEN** undo is processing for slide N
- **THEN** only conflicting mutation controls are disabled and progress is communicated without losing drafts

### Requirement: Editor navigation from the library
Completed presentation summaries SHALL link to their protected editor route.

#### Scenario: Open presentation from home
- **WHEN** an authenticated user activates a completed presentation card
- **THEN** the browser navigates to `/slides/{generationId}`

#### Scenario: Open non-completed presentation
- **WHEN** a pending or failed presentation appears in the library
- **THEN** its card navigates to the detail/editor state that communicates lifecycle status without pretending HTML is available
