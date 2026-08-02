## 1. Auth Foundations

- [x] 1.1 Install `jose` and `bcryptjs` and update the package lockfile.
- [x] 1.2 Add registration and login input schemas with email normalization and bounded password validation.
- [x] 1.3 Define sanitized auth user/session types, application ports, and stable auth errors.

## 2. Credential and Token Infrastructure

- [x] 2.1 Implement bcrypt password hashing and verification with cost factor 12.
- [x] 2.2 Implement `JWT_SECRET` validation plus 15-minute HS256 access-token signing and verification with required claims.
- [x] 2.3 Implement 256-bit opaque refresh-token generation, SHA-256 hashing, and secure refresh-cookie helpers.

## 3. Persistence and Use Cases

- [x] 3.1 Implement Prisma auth persistence for normalized user lookup, user creation, session creation, last-login updates, and sanitized user retrieval.
- [x] 3.2 Implement atomic refresh-session rotation and idempotent session revocation in the Prisma adapter.
- [x] 3.3 Implement registration and login use cases with generic credential and duplicate-account failures.
- [x] 3.4 Implement refresh, logout, bearer authentication, and current-user use cases with active-user checks.

## 4. HTTP API

- [x] 4.1 Add shared auth route helpers for JSON parsing, request metadata, cookie application, sanitized responses, and error mapping.
- [x] 4.2 Implement `POST /api/auth/register` and `POST /api/auth/login` route handlers.
- [x] 4.3 Implement `POST /api/auth/refresh` and idempotent `POST /api/auth/logout` route handlers.
- [x] 4.4 Implement `GET /api/auth/me` and expose the reusable bearer authentication guard for protected server routes.

## 5. Verification

- [x] 5.1 Add unit tests for validation, password hashing, JWT configuration/claims, refresh-token hashing, and cookie attributes.
- [x] 5.2 Add use-case and persistence tests for registration, generic login failures, active-user checks, refresh rotation races, reuse rejection, and logout.
- [x] 5.3 Add route tests covering success responses, status/error mapping, cookie behavior, and sensitive-data exclusion.
- [x] 5.4 Run Prisma validation and generation, TypeScript, lint, the complete test suite, and a production build with valid environment configuration.
