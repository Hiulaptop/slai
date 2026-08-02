## MODIFIED Requirements

### Requirement: Presentation home dashboard
The system SHALL expose `/home` as the authenticated user's presentation library using the owner-scoped list API and SHALL make presentation summaries navigable to the protected editor.

#### Scenario: Dashboard loading
- **WHEN** the initial presentation list is pending
- **THEN** the dashboard displays a labeled loading/skeleton state without showing a false empty state

#### Scenario: Empty presentation list
- **WHEN** the list API returns no presentations
- **THEN** the dashboard displays an empty workspace with one large prominent Create presentation action linking to `/slides/new`

#### Scenario: Populated presentation list
- **WHEN** the list API returns presentations
- **THEN** the dashboard displays responsive summary cards, makes each card link to `/slides/{generationId}`, and shows a prominent create action in an easily visible screen corner

#### Scenario: Presentation summary card
- **WHEN** a presentation card renders
- **THEN** it displays title or a fallback, lifecycle status text, update time, and current revision when available without exposing HTML or provider payload data

#### Scenario: Initial list failure
- **WHEN** the list request fails for a non-authentication reason
- **THEN** the dashboard displays an inline error, a Retry action, and a visible Create presentation action linking to `/slides/new`

#### Scenario: Additional list page
- **WHEN** `nextCursor` is present and the user activates Load more
- **THEN** the dashboard requests the next cursor page, appends new items without replacing current cards, and prevents duplicate loading

#### Scenario: Additional page failure
- **WHEN** loading another page fails
- **THEN** existing cards remain visible and the user can retry
