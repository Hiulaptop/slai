## Purpose

Define the simplified public and authenticated web frontend, including browser authentication state, protected presentation navigation, and responsive accessible behavior.

## Requirements

### Requirement: Simplified public landing page
The system SHALL expose `/` as a responsive public landing page with SLAI identity and clear navigation to login and registration without requiring authentication.

#### Scenario: Anonymous landing visit
- **WHEN** an unauthenticated visitor opens `/`
- **THEN** the page displays the SLAI brand with visible Log in and Register actions linking to `/login` and `/register`

#### Scenario: Landing content restraint
- **WHEN** the landing page renders
- **THEN** it excludes dashboard data, creation forms, feature grids, testimonials, and other nonessential content

#### Scenario: Mobile landing layout
- **WHEN** the viewport is narrow
- **THEN** both authentication actions remain fully visible, touch-sized, and usable without horizontal scrolling

### Requirement: Browser authentication session
The frontend SHALL manage the access token only in memory and SHALL restore an existing session through the HttpOnly refresh cookie.

#### Scenario: Existing refresh session
- **WHEN** the application mounts with a valid refresh cookie
- **THEN** it refreshes once, retrieves the current user with the new bearer token, and enters authenticated state

#### Scenario: No refresh session
- **WHEN** refresh bootstrap returns unauthorized
- **THEN** the application enters anonymous state without exposing an internal error

#### Scenario: Strict Mode bootstrap
- **WHEN** React development Strict Mode evaluates the authentication provider more than once
- **THEN** concurrent bootstrap consumers share one refresh request and do not reuse a rotated token

#### Scenario: Token persistence
- **WHEN** login, registration, or refresh succeeds
- **THEN** the frontend keeps the access token in memory and writes no token to local storage or session storage

#### Scenario: Protected API access expires
- **WHEN** a protected request returns `401`
- **THEN** the client performs at most one shared refresh and retries the original request once with the replacement access token

#### Scenario: Protected API refresh fails
- **WHEN** retry refresh fails
- **THEN** the client clears authenticated state and does not enter a refresh or request retry loop

### Requirement: Login interface
The system SHALL expose `/login` with an accessible email/password form that authenticates against the existing login API.

#### Scenario: Successful login
- **WHEN** an anonymous user submits valid credentials
- **THEN** the form stores the returned user/token in session state and replaces navigation with the safe `next` destination or `/home`

#### Scenario: Invalid login form
- **WHEN** email is invalid or password is outside 8 through 128 characters
- **THEN** the form displays validation feedback and does not submit the API request

#### Scenario: Login API failure
- **WHEN** the API rejects credentials or the request fails
- **THEN** the form displays a concise error in an announced status region and remains usable

#### Scenario: Login pending state
- **WHEN** login submission is in progress
- **THEN** form controls prevent duplicate submission and the submit button communicates progress

#### Scenario: Authenticated login visit
- **WHEN** an authenticated user visits `/login`
- **THEN** the page replaces navigation with `/home`

### Requirement: Registration interface
The system SHALL expose `/register` with an accessible email/password form that creates an account through the existing registration API.

#### Scenario: Successful registration
- **WHEN** an anonymous user submits a valid unused email and password
- **THEN** the form establishes authenticated state and replaces navigation with the safe `next` destination or `/home`

#### Scenario: Invalid registration form
- **WHEN** email is invalid or password is outside 8 through 128 characters
- **THEN** the form displays validation feedback and does not submit the API request

#### Scenario: Registration conflict
- **WHEN** registration fails for an existing or concurrently created account
- **THEN** the form displays a generic registration failure without revealing account data

#### Scenario: Authentication page navigation
- **WHEN** a user is on login or registration
- **THEN** the page provides a visible link to switch to the other authentication flow

#### Scenario: Authenticated registration visit
- **WHEN** an authenticated user visits `/register`
- **THEN** the page replaces navigation with `/home`

### Requirement: Protected frontend navigation
The system MUST prevent anonymous users from viewing protected page content and MUST preserve a safe intended destination.

#### Scenario: Protected route bootstrap
- **WHEN** authentication state is still loading on `/home` or `/slides/new`
- **THEN** the page displays a stable loading state without rendering protected content

#### Scenario: Anonymous protected visit
- **WHEN** authentication resolves anonymous on a protected route
- **THEN** the frontend replaces navigation with `/login?next=<path>`

#### Scenario: Unsafe next destination
- **WHEN** login or registration receives an external, protocol-relative, or otherwise unsafe `next` value
- **THEN** successful authentication navigates to `/home` instead

### Requirement: Authenticated navbar
Protected pages SHALL share a responsive navbar that identifies the current user and provides logout.

#### Scenario: Authenticated navbar content
- **WHEN** a protected page renders for an authenticated user
- **THEN** the navbar displays a home-linked SLAI wordmark, the user's email, and a visible Logout action

#### Scenario: Successful logout
- **WHEN** the user activates Logout
- **THEN** the frontend calls the idempotent logout API, clears local authenticated state, and replaces navigation with `/`

#### Scenario: Logout network failure
- **WHEN** the logout API cannot be reached
- **THEN** the frontend still clears local authenticated state and navigates to `/`

#### Scenario: Navbar mobile layout
- **WHEN** the navbar renders on a narrow viewport
- **THEN** brand, truncated user identity, and logout remain accessible without a menu or horizontal overflow

### Requirement: Presentation home dashboard
The system SHALL expose `/home` as the authenticated user's presentation library using the existing owner-scoped list API.

#### Scenario: Dashboard loading
- **WHEN** the initial presentation list is pending
- **THEN** the dashboard displays a labeled loading/skeleton state without showing a false empty state

#### Scenario: Empty presentation list
- **WHEN** the list API returns no presentations
- **THEN** the dashboard displays an empty workspace with one large prominent Create presentation action linking to `/slides/new`

#### Scenario: Populated presentation list
- **WHEN** the list API returns presentations
- **THEN** the dashboard displays responsive summary cards and a prominent create action in an easily visible screen corner

#### Scenario: Presentation summary card
- **WHEN** a presentation card renders
- **THEN** it displays title or a fallback, lifecycle status text, update time, and current revision when available without exposing HTML or provider payload data

#### Scenario: Initial list failure
- **WHEN** the list request fails for a non-authentication reason
- **THEN** the dashboard displays an inline error and Retry action

#### Scenario: Additional list page
- **WHEN** `nextCursor` is present and the user activates Load more
- **THEN** the dashboard requests the next cursor page, appends new items without replacing current cards, and prevents duplicate loading

#### Scenario: Additional page failure
- **WHEN** loading another page fails
- **THEN** existing cards remain visible and the user can retry

### Requirement: Create presentation placeholder
The system SHALL expose protected `/slides/new` as a valid interim destination for dashboard creation actions.

#### Scenario: Open create destination
- **WHEN** an authenticated user activates either Create presentation action
- **THEN** `/slides/new` displays the authenticated navbar, a clear placeholder message, and navigation back to `/home`

#### Scenario: Anonymous create destination
- **WHEN** an anonymous user visits `/slides/new`
- **THEN** protected navigation redirects them to login with the intended destination

### Requirement: Simplified responsive visual system
The frontend SHALL use a consistent high-contrast simplified design and MUST support keyboard and mobile use.

#### Scenario: Visual consistency
- **WHEN** landing, auth, and protected pages render
- **THEN** they use shared typography, spacing, color, border, radius, button, input, and focus tokens

#### Scenario: Keyboard interaction
- **WHEN** a keyboard user navigates forms, links, navbar, dashboard, and retry/create actions
- **THEN** every interactive control has a visible focus indicator and logical tab order

#### Scenario: Form accessibility
- **WHEN** authentication forms render validation or request status
- **THEN** inputs have programmatic labels, errors are associated or announced, and progress is not communicated by color alone

#### Scenario: Responsive layout
- **WHEN** the viewport ranges from mobile to desktop
- **THEN** content remains readable and operable without horizontal overflow, clipped actions, or pointer-only interactions

#### Scenario: Reduced motion
- **WHEN** the user requests reduced motion
- **THEN** nonessential transitions and loading animation are reduced or disabled
