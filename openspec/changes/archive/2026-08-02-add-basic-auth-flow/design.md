## Context

The project is a Next.js application with a shared Prisma 7 database client. The MySQL schema already contains `User` and `AuthSession`: users have unique emails, password hashes, and active/disabled status; sessions store a unique refresh-token hash, expiry, revocation timestamp, IP address, and user agent. `JWT_SECRET` is configured outside the database.

Authentication crosses domain validation, credential security, token lifecycle, database transactions, cookies, and HTTP handlers. The design must avoid plaintext secrets in storage while remaining small enough for the first auth implementation.

## Goals / Non-Goals

**Goals:**

- Register users with normalized email addresses and securely hashed passwords.
- Authenticate active users and issue short-lived signed access tokens.
- Maintain revocable, rotating refresh sessions without storing refresh tokens in plaintext.
- Expose consistent Next.js API handlers for registration, login, refresh, logout, and current-user lookup.
- Provide a reusable server-side bearer-token verifier for future protected routes.
- Avoid leaking password hashes, token values, or detailed login failure reasons.

**Non-Goals:**

- OAuth, social login, passkeys, multi-factor authentication, or multiple roles.
- Email verification, password reset, password change, or account deletion.
- Frontend login and registration forms.
- Immediate invalidation of already-issued access tokens on logout.
- Distributed rate limiting, device management UI, or administrative user management.
- Database schema or migration changes.

## Decisions

### Organize auth as a feature module

Use `modules/auth/domain` for Zod input schemas and auth errors, `modules/auth/application` for use-case orchestration and ports, and `modules/auth/infrastructure` for Prisma repositories, password hashing, JWT signing, random refresh tokens, and cookies. Next.js route handlers under `app/api/auth` remain the presentation boundary.

This keeps token and persistence details out of route handlers without introducing a repository for unrelated modules. Direct database logic in every handler was rejected because refresh rotation and consistent credential checks would be duplicated.

### Normalize and hash credentials

Normalize email by trimming and converting to lowercase before lookup or insertion. Accept passwords from 8 through 128 characters and hash them with `bcryptjs` using cost factor 12. Login always returns the same unauthorized response for unknown email, incorrect password, or disabled user.

`bcryptjs` is selected over a native Argon2 package to avoid native build requirements in the current deployment setup. The trade-off is lower memory hardness; the bounded password length and cost factor limit abuse while retaining portable deployment.

### Use short-lived JWT access tokens

Use `jose` to sign HS256 JWTs with `JWT_SECRET`, which must contain at least 32 UTF-8 bytes. Tokens expire after 15 minutes and contain only `sub` (user ID), `sid` (session ID), `iat`, `exp`, issuer `slai`, and audience `slai-api`. No email or sensitive account data is embedded.

Protected-route authentication parses `Authorization: Bearer <token>`, verifies signature and claims, then loads the user and requires `ACTIVE` status. Access tokens remain valid until expiry after logout; querying session state on every request was rejected to keep access-token verification simple and bounded. Sensitive future operations can add session checks if required.

### Use opaque rotating refresh tokens

Generate refresh tokens from 32 cryptographically random bytes and return them only in an HttpOnly cookie. Store only the lowercase hexadecimal SHA-256 hash in `AuthSession.refreshTokenHash`. Sessions expire after 30 days and retain optional request IP and user-agent metadata.

On successful refresh, atomically replace the stored hash with a hash of a newly generated token and issue both a new access token and refresh cookie. A consumed token therefore cannot be reused. Expired, revoked, unknown, or disabled-user sessions receive the same unauthorized response and clear the cookie.

Login creates one new session without revoking other devices. Logout finds the current refresh-token hash, marks that session revoked if present, and always clears the cookie, making logout idempotent.

### Keep refresh credentials in a scoped secure cookie

Use cookie name `slai_refresh_token` with `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, a 30-day `Max-Age`, and `Secure` in production. Register and login return the access token in JSON and set the refresh cookie. Refresh and logout are POST endpoints; current-user lookup is GET.

SameSite mitigates common cross-site requests while allowing normal same-site navigation. A JavaScript-readable refresh token or local-storage access token persistence is not part of the server API design.

### Define stable endpoint behavior

- `POST /api/auth/register`: validates credentials, creates the user and first session, returns `201` with sanitized user and access token, and sets the refresh cookie.
- `POST /api/auth/login`: verifies credentials, creates a session, updates `lastLoginAt`, returns `200` with sanitized user and access token, and sets the refresh cookie.
- `POST /api/auth/refresh`: rotates a valid session and returns `200` with a new access token and refresh cookie.
- `POST /api/auth/logout`: revokes the presented refresh session when present, clears the cookie, and returns `204` regardless of token validity.
- `GET /api/auth/me`: authenticates the bearer access token and returns `200` with sanitized user data.

Validation errors return `400`; duplicate registration returns a generic `409`; invalid credentials or tokens return `401`; unexpected failures return `500`. Responses never include `passwordHash` or `refreshTokenHash`.

## Risks / Trade-offs

- [Credential stuffing and brute-force attempts remain possible] -> Use generic errors and a deliberately expensive password hash; add distributed rate limiting before public launch.
- [Logout does not immediately revoke an access token] -> Limit access tokens to 15 minutes and revoke refresh capability immediately.
- [Refresh token theft permits use until rotation or expiry] -> Keep it HttpOnly, Secure in production, SameSite-scoped, hashed at rest, and rotate it on every use.
- [Concurrent refresh requests can race] -> Make hash replacement conditional on the current unrevoked, unexpired session state so only one request succeeds.
- [Lowercasing email assumes case-insensitive account identity] -> Treat all application accounts as case-insensitive consistently at registration and login.
- [JWT secret rotation is not supported] -> Keep the secret in deployment secret management; adding key IDs and overlapping keys is a future capability.

## Migration Plan

1. Install `jose` and `bcryptjs`.
2. Add auth domain schemas, application contracts/use cases, and infrastructure implementations.
3. Add route handlers and shared response/cookie helpers.
4. Add unit tests for credentials, token verification, session rotation, and route behavior.
5. Run Prisma validation, TypeScript, lint, tests, and a production build with required environment variables.

Rollback removes the auth routes, module, and dependencies. Existing user and session tables remain unchanged; any created sessions can be deleted without affecting other data.

## Open Questions

None.
