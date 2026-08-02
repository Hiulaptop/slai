## MODIFIED Requirements

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

## ADDED Requirements

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
