## Why

The application has user and session tables but no authentication behavior, so it cannot identify users or protect slide-generation data. A basic first-party auth flow is needed before user-owned features and request authorization can be implemented.

## What Changes

- Add email and password registration with normalized unique emails and securely hashed passwords.
- Add login for active users that returns a short-lived JWT access token and creates a revocable refresh session.
- Add refresh-token rotation through a secure HttpOnly cookie and revoke sessions on logout.
- Add current-user lookup and reusable bearer-token authentication for protected API routes.
- Return consistent validation and authentication errors without exposing password hashes, refresh tokens, or account-enumeration details.

## Capabilities

### New Capabilities

- `basic-auth`: Covers registration, login, access-token authentication, refresh rotation, logout, and current-user retrieval.

### Modified Capabilities

None.

## Impact

- Adds auth domain validation, application services, persistence adapters, JWT/password infrastructure, and Next.js route handlers.
- Uses the existing `User`, `AuthSession`, shared database client, `DATABASE_URL`, and `JWT_SECRET` configuration.
- Adds password-hashing and JWT dependencies.
- Introduces `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, and `/api/auth/me` endpoints.
- Does not change the existing database schema or migrations.
