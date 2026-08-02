## ADDED Requirements

### Requirement: User registration
The system SHALL register a user from a valid email and password, normalize the email, store only a secure password hash, create a refresh session, and return a sanitized user with an access token.

#### Scenario: Successful registration
- **WHEN** a client submits an unused valid email and a password from 8 through 128 characters
- **THEN** the system creates an active user with a lowercase trimmed email, creates a refresh session, returns status `201` with the sanitized user and access token, and sets the refresh cookie

#### Scenario: Invalid registration input
- **WHEN** a client submits an invalid email or a password outside the allowed length
- **THEN** the system returns status `400` without creating a user or session

#### Scenario: Duplicate registration
- **WHEN** a client submits an email already assigned to a user after normalization
- **THEN** the system returns status `409` with a generic registration failure and does not expose existing account data

### Requirement: Password login
The system SHALL authenticate active users by normalized email and password without revealing which credential or account condition caused a failure.

#### Scenario: Successful login
- **WHEN** a client submits credentials matching an active user
- **THEN** the system creates a refresh session, updates the user's last-login time, returns status `200` with the sanitized user and access token, and sets the refresh cookie

#### Scenario: Invalid login
- **WHEN** the email is unknown, the password is incorrect, or the user is disabled
- **THEN** the system returns the same status `401` response and does not create a session

### Requirement: Access token issuance
The system SHALL issue HS256 access JWTs signed by `JWT_SECRET`, valid for 15 minutes, and containing only the user ID, session ID, standard timing claims, issuer, and audience.

#### Scenario: Access token claims
- **WHEN** registration, login, or refresh succeeds
- **THEN** the returned JWT identifies the user and session, has issuer `slai`, audience `slai-api`, and expires 15 minutes after issuance

#### Scenario: Invalid JWT configuration
- **WHEN** `JWT_SECRET` is absent or shorter than 32 UTF-8 bytes
- **THEN** auth initialization fails with a configuration error before issuing or verifying tokens

### Requirement: Bearer authentication
The system MUST authenticate protected requests from a valid bearer access token and reject malformed, expired, incorrectly signed, or inactive-user credentials.

#### Scenario: Valid bearer token
- **WHEN** a request provides a valid `Authorization: Bearer` access token for an active user
- **THEN** the auth guard returns the authenticated user identity to the protected handler

#### Scenario: Missing or invalid bearer token
- **WHEN** a protected request omits the bearer token or provides an invalid token
- **THEN** the system returns status `401` without exposing token verification details

#### Scenario: Disabled user bearer token
- **WHEN** a valid access token identifies a user whose status is no longer active
- **THEN** the system returns status `401`

### Requirement: Refresh session storage
The system MUST generate refresh tokens with at least 256 bits of cryptographic randomness, expose them only through the refresh cookie, and persist only their SHA-256 hashes.

#### Scenario: Session creation
- **WHEN** registration or login succeeds
- **THEN** the system stores the refresh-token hash, user ID, 30-day expiry, and available request metadata without storing the token value

#### Scenario: Refresh cookie attributes
- **WHEN** the system issues a refresh token
- **THEN** it sets `slai_refresh_token` as HttpOnly, SameSite Lax, scoped to `/api/auth`, valid for 30 days, and Secure in production

### Requirement: Refresh token rotation
The system SHALL accept a valid refresh cookie once, atomically rotate its stored hash, and return a new access token and refresh cookie.

#### Scenario: Successful refresh
- **WHEN** a client sends an unexpired, unrevoked refresh token for an active user
- **THEN** the system invalidates that token, stores the replacement hash, returns status `200` with a new access token, and sets the replacement refresh cookie

#### Scenario: Reused refresh token
- **WHEN** a client presents a refresh token that was already rotated
- **THEN** the system returns status `401` and clears the refresh cookie

#### Scenario: Invalid refresh session
- **WHEN** the refresh token is missing, unknown, expired, revoked, or belongs to a disabled user
- **THEN** the system returns status `401`, clears the refresh cookie, and does not issue tokens

### Requirement: Logout
The system SHALL provide idempotent logout that revokes the refresh session associated with the presented cookie when possible and always clears the cookie.

#### Scenario: Logout with valid session
- **WHEN** a client submits logout with a valid refresh cookie
- **THEN** the system marks the session revoked, clears the cookie, and returns status `204`

#### Scenario: Logout without valid session
- **WHEN** a client submits logout without a cookie or with an unknown token
- **THEN** the system clears the cookie and returns status `204`

### Requirement: Current user retrieval
The system SHALL expose the authenticated active user's non-sensitive account data through the current-user endpoint.

#### Scenario: Authenticated current-user request
- **WHEN** an active user calls `GET /api/auth/me` with a valid bearer access token
- **THEN** the system returns status `200` with the user's ID, email, status, and account timestamps

#### Scenario: Unauthenticated current-user request
- **WHEN** `GET /api/auth/me` lacks valid bearer authentication
- **THEN** the system returns status `401`

### Requirement: Sensitive data exclusion
The system MUST exclude password hashes, refresh-token hashes, and raw refresh tokens from JSON responses and authentication error details.

#### Scenario: Auth response serialization
- **WHEN** any auth endpoint serializes a success or error response
- **THEN** the response body contains no password hash, refresh-token hash, or raw refresh token
