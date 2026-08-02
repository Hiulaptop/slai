## 1. Persistence and Access Contracts

- [x] 1.1 Add the `[userId, createdAt, id]` Prisma index and a forward MySQL migration for owner feed pagination.
- [x] 1.2 Add strict list query, opaque cursor payload, and generation ID schemas with default/max page limits.
- [x] 1.3 Define separate presentation access, list summary, detail, and page DTOs so list queries cannot fetch or serialize large fields.
- [x] 1.4 Extend the slide repository port with owner-scoped access lookup, cursor list, and conditional delete operations.

## 2. Authorization and Query Services

- [x] 2.1 Implement cursor encode/decode utilities with base64url, ISO timestamp, UUID, and strict malformed-input handling.
- [x] 2.2 Implement `PresentationAccessPolicy` for owner-only read, completed mutation, and non-processing delete decisions.
- [x] 2.3 Implement Prisma access/detail lookup using combined generation ID and user ID filters with no unscoped fallback.
- [x] 2.4 Implement owner-scoped `limit + 1` list queries ordered by creation time and ID descending with cursor boundaries.
- [x] 2.5 Implement conditional owner/state deletion and rely on the existing revision cascade without deleting non-owned or newly processing records.
- [x] 2.6 Add slide service methods for list, detail, and delete with safe DTO mapping and cursor generation.
- [x] 2.7 Refactor existing edit and undo methods to resolve mutation access through `PresentationAccessPolicy` while preserving existing conflict behavior.

## 3. HTTP Routes

- [x] 3.1 Add list/detail response serializers that exclude ownership IDs, persistence payloads, errors, revision allocators, and revision snapshots.
- [x] 3.2 Implement authenticated `GET /api/slides` with strict `limit` and `cursor` parsing.
- [x] 3.3 Implement authenticated owner-scoped `GET /api/slides/{generationId}`.
- [x] 3.4 Implement authenticated owner-scoped `DELETE /api/slides/{generationId}` returning `204` on success.
- [x] 3.5 Keep missing/cross-owner errors identical and map invalid IDs to `400` and prohibited/stale state to `409`.

## 4. Verification

- [x] 4.1 Add schema/cursor tests for defaults, limits, malformed cursors, round trips, and equal-timestamp ID boundaries.
- [x] 4.2 Add access policy tests for owner reads, completed mutations, processing deletion conflicts, incomplete mutation conflicts, and ownership concealment.
- [x] 4.3 Add repository tests for owner filters, summary-only selections, stable cursor conditions, `limit + 1`, conditional deletion, and zero-count races.
- [x] 4.4 Add service tests for empty/multiple pages, next cursors, detail lifecycle states, safe DTOs, delete outcomes, and edit/undo policy reuse.
- [x] 4.5 Add route tests for authentication-before-query, pagination validation, list/detail serialization, ownership concealment, delete `204`, and stable error mapping.
- [x] 4.6 Run Prisma format/generate/validate, migration SQL verification, TypeScript, lint, the full test suite, strict OpenSpec validation, and a production build.
