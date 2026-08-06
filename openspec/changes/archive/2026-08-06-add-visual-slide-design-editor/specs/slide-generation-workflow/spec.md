## ADDED Requirements

### Requirement: Design presentation bootstrap
The system SHALL expose an authenticated bootstrap operation that creates an owner-owned completed presentation from blank defaults without AI generation. Template-seeded bootstrap (`mode: "template"`) is accepted at the schema level but always rejected with `400 INVALID_INPUT`, since no template library (storage, ownership, selection) exists in this codebase yet — that is a separate, unscoped capability.

#### Scenario: Blank bootstrap persistence
- **WHEN** the owner bootstraps a blank project with a valid title and positive slide count
- **THEN** the system stores status `COMPLETED`, sanitized HTML with contiguous `.slai-slide` wrappers, an initial revision, lifecycle timestamps, and ownership for the caller

#### Scenario: Template bootstrap rejected
- **WHEN** the owner bootstraps with `mode: "template"` and any `templateId`
- **THEN** the system returns `400 INVALID_INPUT` and creates no presentation row, since no template library exists yet

#### Scenario: Bootstrap request metadata
- **WHEN** design bootstrap begins
- **THEN** persisted request metadata records mode, title, and slide count, and excludes raw file payloads

#### Scenario: Bootstrap authorization
- **WHEN** bootstrap is unauthenticated
- **THEN** the system returns `401` and creates no presentation row

### Requirement: Design HTML save
The system SHALL accept owner design saves that replace the full presentation HTML under the existing slide-wrapper and sanitization contracts and append an immutable revision.

#### Scenario: Successful design save
- **WHEN** the owner submits valid complete HTML for their completed presentation with a matching expected revision
- **THEN** the system sanitizes, validates wrappers, appends a revision, updates the current pointer, and returns the detail DTO fields needed by the editor

#### Scenario: Concurrent design save
- **WHEN** two saves race on the same current revision
- **THEN** exactly one compare-and-swap succeeds and the stale save returns `409` without orphan revisions

#### Scenario: Unsafe design HTML rejected
- **WHEN** submitted HTML contains scripts, handlers, forms, remote dependencies, or invalid wrappers
- **THEN** the system rejects the save and leaves the current HTML and revision pointer unchanged

## MODIFIED Requirements

### Requirement: Authenticated slide operations
The system MUST require valid bearer authentication for outline, generation, list, detail, edit, undo, delete, design bootstrap, and design save routes and MUST authorize stored presentation operations through a shared owner-only access policy.

#### Scenario: Authenticated owner request
- **WHEN** an active authenticated user invokes a permitted slide operation for their own presentation
- **THEN** the system performs the requested operation subject to input and lifecycle-state validation

#### Scenario: Unauthenticated request
- **WHEN** any slide route receives no valid bearer access token
- **THEN** the system returns status `401` without reading or mutating presentation data or calling the AI provider

#### Scenario: Different owner
- **WHEN** an authenticated user requests, edits, undoes, deletes, or design-saves another user's presentation
- **THEN** the system returns the same status `404` response used for a nonexistent presentation and does not reveal ownership or lifecycle data

#### Scenario: Shared policy enforcement
- **WHEN** detail, edit, undo, delete, or design save resolves presentation access
- **THEN** the application uses the same owner-scoped access policy with the operation's required lifecycle state

### Requirement: Presentation HTML contract
The system MUST accept and persist only sanitized complete HTML5 presentations whose slide wrappers match the active slide count. The output SHALL use self-contained CSS and embedded local assets without a fixed product-level slide maximum. Design-bootstrapped blank decks SHALL use a minimal default slide shell that still satisfies the `.slai-slide` wrapper rules.

#### Scenario: Valid standalone presentation
- **WHEN** model output or design save contains valid slide wrappers and declared asset references
- **THEN** the server injects exact base64 assets where required, sanitizes the result, enforces bounded slide CSS, and persists the standalone document

#### Scenario: Invalid active or external content
- **WHEN** output contains scripts, event handlers, forms, remote dependencies, package-relative resources, or unsafe embedded content
- **THEN** the system rejects the output and persists no completed revision for that mutation

#### Scenario: Valid blank design document
- **WHEN** blank bootstrap or a blank design save contains only safe wrappers and allowlisted CSS
- **THEN** the system accepts the document without requiring template skeleton markers
