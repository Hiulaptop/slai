## Why

Generated presentations are currently reachable only through edit and undo operations, with ownership checks duplicated inside service/repository paths. Users need a consistent authorization boundary and basic APIs to discover and manage only their own presentations without exposing another user's records.

## What Changes

- Add a reusable presentation access policy that authenticates the caller, resolves a presentation by owner, and applies operation-specific state requirements.
- Refactor existing edit and undo operations to use the shared owner-only policy instead of independent access checks.
- Add an authenticated, cursor-paginated route to list the caller's presentations using summary fields only.
- Add an authenticated route to retrieve one owned presentation with its current HTML, approved outline, revision, lifecycle, and provider metadata.
- Add an authenticated route to delete one owned presentation and its revisions while concealing records owned by other users.
- Standardize presentation authorization failures so missing and non-owned resources both return `404`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `slide-generation-workflow`: Extend authenticated slide operations with reusable owner access control and owner-scoped list, detail, and delete routes.

## Impact

- Extends slide application ports/services, Prisma repository queries, presentation middleware/policy helpers, and Next.js routes.
- Uses the existing bearer authentication service and `SlideGeneration.userId` ownership relation; no role or sharing schema is introduced.
- Adds cursor pagination and response DTOs that exclude HTML and large payloads from list results.
- Adds tests for ownership concealment, pagination isolation, state rules, deletion cascade, and existing edit/undo authorization behavior.
