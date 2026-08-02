## Why

The application has a generated Prisma Client and MySQL schema but no reusable runtime database instance. Creating clients ad hoc would duplicate connection pools and can exhaust database connections during Next.js development reloads.

## What Changes

- Add a server-only shared Prisma Client instance for application database access.
- Reuse the instance across Next.js development reloads while creating a normal process-scoped instance in production.
- Fail clearly when required database configuration is unavailable.
- Add focused tests for instance creation and development reuse behavior.

## Capabilities

### New Capabilities

- `database-client`: Provides a reusable, server-side Prisma Client instance backed by the configured MySQL database.

### Modified Capabilities

None.

## Impact

- Adds a database infrastructure module that imports the generated Prisma Client.
- Uses the existing `DATABASE_URL` configuration and Prisma schema without changing database tables or migrations.
- Establishes the database dependency that future authentication, slide generation, request logging, and system logging code can consume.
