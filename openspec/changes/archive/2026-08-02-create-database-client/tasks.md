## 1. Runtime Database Setup

- [x] 1.1 Install `@prisma/adapter-mariadb` and update the package lockfile.
- [x] 1.2 Add a server-only database module that parses and validates `DATABASE_URL` into MariaDB adapter settings.
- [x] 1.3 Construct the generated Prisma Client with the adapter and export the shared `db` instance.
- [x] 1.4 Cache and reuse the client through a typed `globalThis` property outside production without populating that cache in production.

## 2. Verification

- [x] 2.1 Add unit tests covering URL parsing, default port behavior, invalid configuration, and development instance reuse.
- [x] 2.2 Generate and validate Prisma Client, then run TypeScript, lint, and the complete test suite.
