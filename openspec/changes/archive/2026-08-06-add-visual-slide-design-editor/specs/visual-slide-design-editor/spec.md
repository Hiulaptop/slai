## Purpose

Lets an owner start a presentation from a blank canvas, place and arrange text/shape/image elements with direct manipulation tools, and save or export the result as a standalone HTML deck, without going through report upload or AI generation.

## ADDED Requirements

### Requirement: Create path chooses design or report generation
The system SHALL present Create as a protected entry that lets the authenticated user choose a design-first project (template or blank) or the existing report-driven generation workspace.

#### Scenario: Anonymous Create visit
- **WHEN** an anonymous user visits `/slides/new`
- **THEN** the protected shell redirects to login with `/slides/new` as the safe intended destination

#### Scenario: Choose design path
- **WHEN** an authenticated user activates the design-first create option
- **THEN** the client shows project setup for title and template-or-blank selection without requiring report files or outline review

#### Scenario: Choose report generation path
- **WHEN** an authenticated user activates generate-from-report
- **THEN** the existing multi-phase creation workspace remains available and unchanged by this capability's design tools

### Requirement: Blank project bootstrap
The system SHALL create an owner-owned completed presentation from a blank default document without calling the AI provider. Template-seeded bootstrap is not yet implemented — no template library (storage, ownership, or selection API) exists in this codebase; `mode: "template"` is accepted at the request-schema level for forward compatibility but is currently rejected with `400 INVALID_INPUT`. Implementing template-seeded bootstrap requires its own capability and change.

#### Scenario: Blank project create
- **WHEN** the owner submits a valid title and blank mode with a positive initial slide count
- **THEN** the system persists a completed presentation whose HTML contains that many contiguous one-based `.slai-slide` wrappers, default design CSS, no external resources, and returns the new generation ID for editor navigation

#### Scenario: Template mode rejected
- **WHEN** the owner submits `mode: "template"` with any `templateId`
- **THEN** the system rejects the bootstrap with `400 INVALID_INPUT` and creates no presentation, since no template library exists yet

#### Scenario: Unauthenticated bootstrap
- **WHEN** bootstrap is called without a valid bearer token
- **THEN** the system returns `401` and creates no presentation

#### Scenario: Invalid bootstrap input
- **WHEN** title is blank, mode is invalid, blank slide count is not a positive integer, or template mode omits `templateId`
- **THEN** the system returns `400` and creates no presentation

#### Scenario: Bootstrap skips AI
- **WHEN** blank bootstrap succeeds
- **THEN** the system does not invoke the AI provider and does not require report files or an approved outline for completion

### Requirement: Visual design editor access
The system SHALL expose an owner-protected visual design editor for design-bootstrapped and other design-editable completed presentations.

#### Scenario: Open design editor after bootstrap
- **WHEN** bootstrap returns a generation ID
- **THEN** the client navigates to the design editor for that ID and loads the presentation detail for canvas rendering

#### Scenario: Anonymous design editor visit
- **WHEN** an anonymous user opens a design editor URL
- **THEN** protected navigation redirects to login with the intended destination

#### Scenario: Missing or non-owned design editor
- **WHEN** detail returns `404`
- **THEN** the editor shows a not-found state without revealing whether the ID exists for another user

#### Scenario: Incomplete presentation
- **WHEN** the presentation is not completed or has no HTML
- **THEN** the design editor does not enter an editable canvas state and communicates the lifecycle status

### Requirement: Design tools on the canvas
The design editor SHALL provide tools to draw and arrange slide content while preserving the presentation HTML slide-wrapper contract.

#### Scenario: Select and transform
- **WHEN** the user selects an element and moves or resizes it within the slide boundary
- **THEN** the canvas updates that element only and keeps content inside the active `.slai-slide` wrapper

#### Scenario: Add text
- **WHEN** the user activates the text tool and places text on the slide
- **THEN** the editor inserts a text element the user can edit without introducing scripts or event handlers

#### Scenario: Add shapes
- **WHEN** the user draws a rectangle, ellipse, or line
- **THEN** the editor adds a static shape element with allowlisted styling inside the selected slide

#### Scenario: Place image
- **WHEN** the user places a supported image within size limits
- **THEN** the editor embeds the image as a validated data URL (or equivalent server-accepted form) without remote URL dependencies

#### Scenario: Layer order
- **WHEN** the user brings an element forward or sends it backward
- **THEN** the visual stacking order updates for that slide only

#### Scenario: Delete element
- **WHEN** the user deletes a selected design element
- **THEN** the element is removed from the active slide and no other slides change

#### Scenario: Tool safety
- **WHEN** any tool would introduce scripts, handlers, forms, remote resources, or `javascript:` URLs
- **THEN** the editor prevents the mutation client-side and the server rejects such HTML on save

### Requirement: Slide management in design mode
The design editor SHALL allow adding, removing, and reordering slides with contiguous one-based numbering and at least one remaining slide.

#### Scenario: Add slide
- **WHEN** the user adds a slide
- **THEN** a new empty slide is appended and numbers remain contiguous and unique

#### Scenario: Delete slide
- **WHEN** the user deletes a slide and more than one slide exists
- **THEN** that wrapper is removed and remaining slides are renumbered contiguously

#### Scenario: Refuse delete last slide
- **WHEN** only one slide remains
- **THEN** the editor prevents deletion of that slide

#### Scenario: Reorder slides
- **WHEN** the user reorders the slide strip
- **THEN** wrapper order and `data-slide-number` values stay contiguous and match the new order

### Requirement: Design save and revision
The system SHALL persist design-editor HTML as an owner-scoped immutable revision after server sanitization and structure validation.

#### Scenario: Successful save
- **WHEN** the owner saves valid design HTML with the current expected revision
- **THEN** the system sanitizes the document, appends one revision, updates the current pointer, and returns updated HTML and revision metadata

#### Scenario: Stale save
- **WHEN** the expected revision no longer matches the current pointer
- **THEN** the system returns `409`, creates no orphan revision, and leaves current HTML unchanged

#### Scenario: Invalid design HTML
- **WHEN** saved HTML fails the slide-wrapper contract, sanitization, size limits, or safety rules
- **THEN** the system returns an error without changing the stored presentation

#### Scenario: Local unsaved tools
- **WHEN** the user uses tools before save
- **THEN** changes remain local until a successful save commits them as a revision

### Requirement: Export designed presentation to HTML
The design editor SHALL let the owner download the current presentation as a standalone HTML file.

#### Scenario: Download after design
- **WHEN** the owner activates Download HTML for a completed design presentation
- **THEN** the browser downloads a safe `.html` file derived from the current sanitized full document with application-owned standalone navigation

#### Scenario: Export includes latest save
- **WHEN** the latest successful design save has completed
- **THEN** the downloaded HTML reflects that revision's content

#### Scenario: Unsaved changes before export
- **WHEN** the canvas has unsaved local changes and the user requests download
- **THEN** the client either saves first successfully or prompts the user so export does not silently drop canvas work

#### Scenario: Offline navigation of export
- **WHEN** the downloaded HTML is opened outside SLAI
- **THEN** it shows one slide at a time with previous/next (and keyboard arrows) without depending on the SLAI application runtime

### Requirement: Library resume for design projects
Completed presentations SHALL be openable from the home library into the design editor via an explicit link on every card. Automatic routing based on presentation origin (design-bootstrapped vs AI-generated) is not yet implemented — `PresentationSummary`/`StoredPresentation` carry no origin/mode field to distinguish them, so every card exposes the same manual link rather than the editor being chosen automatically.

#### Scenario: Open design project from home
- **WHEN** an authenticated owner activates the "Open in design editor" link on a presentation card
- **THEN** the browser navigates to that presentation's design editor

#### Scenario: List excludes HTML bodies
- **WHEN** design projects appear in the presentation list
- **THEN** list items follow the existing summary contract and exclude HTML bodies
