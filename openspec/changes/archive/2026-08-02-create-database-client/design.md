## Context

Prisma 7 generates the client into `generated/prisma`, but this client requires a runtime driver adapter. The project uses a self-hosted MySQL database configured by `DATABASE_URL` and Next.js, whose development server can reload modules repeatedly. Without a shared instance, each reload can create another connection pool.

## Goals / Non-Goals

**Goals:**

- Provide one server-only import that application code can use for Prisma queries.
- Configure Prisma 7 for MySQL through the supported MariaDB driver adapter.
- Reuse the client through `globalThis` in development to avoid connection pool proliferation during hot reloads.
- Keep production lifetime process-scoped without intentionally adding mutable global state.
- Report missing or malformed database configuration before attempting a query.

**Non-Goals:**

- Add repositories, application services, or domain abstractions.
- Modify the Prisma schema or migrations.
- Test connectivity during module import or add a health-check endpoint.
- Support multiple databases, tenant-specific clients, or Prisma Accelerate.

## Decisions

### Use the Prisma MariaDB driver adapter

Install `@prisma/adapter-mariadb` and construct the generated `PrismaClient` with `PrismaMariaDb`. Prisma 7 requires either a driver adapter or an Accelerate URL, and the MariaDB adapter is Prisma's supported adapter for self-hosted MySQL and MariaDB.

The alternative of calling `new PrismaClient()` without options is incompatible with the generated Prisma 7 client. Prisma Accelerate is not selected because the database is self-hosted and no managed proxy requirement exists.

### Derive adapter configuration from `DATABASE_URL`

Parse `DATABASE_URL` with the standard `URL` API and map its hostname, port, username, password, and database path to the adapter configuration. This keeps one source of database configuration shared with Prisma CLI while avoiding a second set of environment variables.

The module will reject a missing URL, a non-MySQL protocol, missing credentials, a missing host, or a missing database name with a configuration-focused error. Percent-encoded credentials and database names will be decoded before adapter construction.

### Export a module-level singleton

Create the adapter and Prisma Client once at module evaluation and export the client as `db`. In development, read and write a typed `globalThis` property so Next.js hot reloads reuse the existing client. In production, export the new process-scoped client without assigning it to the development cache.

A client factory remains internal rather than becoming a general dependency-injection API. Consumers need one configured database instance, and exposing construction would make accidental connection pool duplication easier.

### Keep the module server-only

Add the `server-only` marker import so a client component cannot bundle or access database credentials. The module will live in a database infrastructure location and import the generated server client directly.

## Risks / Trade-offs

- [The MariaDB driver is used against MySQL] -> Prisma documents this adapter for self-hosted MySQL and MariaDB; integration validation will use the existing MySQL datasource configuration.
- [Import-time configuration validation can fail builds that evaluate server modules without secrets] -> Only modules that import the database client require `DATABASE_URL`; the error is immediate and identifies the missing configuration.
- [A global development cache can retain a client after environment changes] -> Restarting the development process is required after changing `DATABASE_URL`, which matches normal environment-variable behavior.
- [A connection is not verified during construction] -> Avoid import-time network I/O; operational connectivity failures surface on the first query and can later be exposed through a dedicated health check.

## Migration Plan

1. Install the MySQL-compatible Prisma driver adapter.
2. Add the server-only database client module and focused unit tests.
3. Generate Prisma Client and run static validation and tests.
4. Future database consumers import the shared `db` instance instead of constructing Prisma clients.

Rollback consists of removing the module and driver adapter dependency; no database migration or data rollback is required.

## Open Questions

None.
