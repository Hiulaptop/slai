## Context

The slide module authenticates each route with the existing bearer guard. Edit and undo then call a private `SlideService.requireComplete`, which asks the repository for `(generationId, userId)` and converts absent/cross-owner rows to `404`. This protects the current mutation routes, but authorization is coupled to generation completeness, cannot be reused for read/delete operations, and is not represented as an explicit application policy.

`SlideGeneration` already stores ownership, lifecycle status, title, current HTML/outline/revision, timestamps, and provider metadata. Its revisions cascade on generation deletion. The current `[userId, createdAt]` index nearly supports an owner-scoped feed, but stable cursor pagination also needs the ID tie-breaker.

## Goals / Non-Goals

**Goals:**

- Centralize owner-only presentation authorization and operation-specific state checks.
- Ensure missing and cross-owner IDs are indistinguishable.
- Add lightweight owner-scoped list, full detail, and delete routes.
- Use stable cursor pagination that cannot leak or traverse another user's records.
- Keep existing edit/undo behavior while routing their access decisions through the shared policy.

**Non-Goals:**

- Add public links, sharing, collaborators, organization tenancy, roles, or administrator access.
- Add individual per-slide ACLs inside one presentation; every slide inherits presentation ownership.
- Add restore, soft deletion, bulk deletion, search, sorting options, or revision-history APIs.
- Move bearer verification into global Next.js middleware or change the authentication token design.

## Decisions

### Model access at the presentation boundary

All slides in one generated HTML document inherit the owning `SlideGeneration.userId`. The access policy therefore authorizes a presentation, not individual wrapper numbers. This avoids an unnecessary ACL table and guarantees that list/detail/delete/edit/undo use the same ownership rule.

The policy exposes operations equivalent to:

- `read`: owner may access any lifecycle state.
- `mutate`: owner may edit/undo only a `COMPLETED` presentation with current HTML and revision state.
- `delete`: owner may delete terminal or pending presentations, but not `PROCESSING` presentations.

Every lookup includes both ID and authenticated user ID. An absent result always becomes `SlideError("NOT_FOUND")`; no fallback unscoped lookup is allowed. `PROCESSING` deletion and non-complete mutation return `409`.

### Use application policy rather than global framework middleware

Create `PresentationAccessPolicy` in the slide application layer and inject the repository access reader. Routes continue to call `authenticateRequest` first and pass the resulting user ID into service methods. `SlideService` invokes the policy before detail, delete, edit, and undo operations.

Global Next.js middleware was rejected because resource authorization requires a database lookup, operation state, and domain error mapping. Putting this in framework middleware would duplicate route matching, couple domain behavior to Next.js, and make service calls from non-HTTP entry points less safe.

### Add owner-scoped REST routes

- `GET /api/slides?limit=20&cursor=<opaque>` lists only the caller's presentations.
- `GET /api/slides/{generationId}` returns one owned presentation.
- `DELETE /api/slides/{generationId}` deletes one owned non-processing presentation and returns `204`.

The existing generation, edit, and undo routes remain unchanged externally. Invalid UUIDs/query values return `400`; absent/cross-owner IDs return `404`; prohibited state transitions return `409`.

### Keep list responses small and deterministic

List items contain only `id`, `title`, `status`, `currentRevisionNumber`, `createdAt`, `updatedAt`, and `completedAt`. They exclude HTML, approved outline, request/response payloads, errors, token usage, and provider/model fields.

Sort by `(createdAt DESC, id DESC)`. Add database index `[userId, createdAt, id]`. The repository fetches `limit + 1` rows under `userId`; if an extra row exists, the service returns an opaque base64url cursor encoding the last returned row's ISO timestamp and ID. Cursor parsing uses a strict schema, and the cursor condition is always combined with the authenticated `userId` filter.

Offset pagination was rejected because new generations can cause duplicates/skips between pages and large offsets become increasingly expensive.

Response shape:

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Presentation title",
      "status": "COMPLETED",
      "currentRevisionNumber": 3,
      "createdAt": "2026-08-02T00:00:00.000Z",
      "updatedAt": "2026-08-02T00:10:00.000Z",
      "completedAt": "2026-08-02T00:05:00.000Z"
    }
  ],
  "nextCursor": null
}
```

### Return a full but safe detail DTO

Detail returns the existing presentation response fields plus `title`, `createdAt`, `updatedAt`, and `completedAt`. It includes current HTML and approved outline because the owner needs them to render/edit. It excludes `userId`, request/response payloads, error internals, `nextRevisionNumber`, revision rows, and raw upload data.

Failed/pending/processing records can be retrieved; absent fields remain `null`. This lets clients show lifecycle status without granting mutation access.

### Delete with one owner-and-state-scoped operation

The repository deletes using a transaction or `deleteMany` constrained by `id`, `userId`, and `status != PROCESSING`. A zero count is ambiguous between not-found, cross-owner, and processing, so the policy first resolves the owned record: missing becomes `404`, processing becomes `409`, then the conditional delete protects against a concurrent transition. A stale zero-count delete becomes `409`.

Hard deletion is selected because no restore requirement exists and `SlideRevision` already cascades. Existing API/system logs retain nullable references through their `SetNull` relation behavior.

### Separate summary and detail repository selections

Add purpose-specific repository methods and DTOs rather than broadening the existing selection everywhere. List queries never fetch `LONGTEXT` HTML or JSON outline fields. Access/detail fetches only fields needed by the policy and response. This keeps authorization explicit and avoids accidentally serializing persistence-only data.

## Risks / Trade-offs

- [A list cursor can be tampered with] -> Treat it as untrusted input, strictly decode/validate it, and always apply owner filtering; cursor contents grant no authority.
- [Two rows can share the same creation time] -> Use ID as a deterministic secondary descending key and include it in the index/cursor.
- [Deletion can race generation completion] -> Reject observed `PROCESSING` state and use a conditional owner/state delete; return `409` on stale state.
- [Hard deletion is irreversible] -> Limit deletion to authenticated owners, require a specific UUID route, and exclude bulk deletion from scope.
- [Central policy can become a generic authorization framework] -> Keep only the three concrete presentation operations and introduce roles/sharing only with a future persisted requirement.
- [Nullable historical `userId` rows cannot be managed] -> Owner routes intentionally exclude orphaned rows; no ownership backfill is inferred.

## Migration Plan

1. Add the composite owner/feed index with a forward Prisma migration.
2. Add pagination/access schemas, cursor utilities, summary/detail DTOs, repository ports, and owner-scoped Prisma queries.
3. Add `PresentationAccessPolicy`, integrate it into `SlideService`, and refactor edit/undo access through it.
4. Add list/detail/delete routes and extend stable response/error helpers.
5. Verify ownership isolation, cursor boundaries, lifecycle conflicts, cascade deletion, existing mutation behavior, and production checks.

Rollback removes the routes and policy integration, restores the previous edit/undo lookup, and drops the added composite index with a forward migration. No presentation data transformation is required.

## Open Questions

None.
