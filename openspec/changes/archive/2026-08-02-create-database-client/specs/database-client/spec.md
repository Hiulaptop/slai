## ADDED Requirements

### Requirement: Shared database client
The system SHALL expose a server-side Prisma Client instance that application code can reuse for MySQL database operations.

#### Scenario: Server code imports the database client
- **WHEN** server-side application code imports the database module with valid configuration
- **THEN** the module provides a configured Prisma Client instance

### Requirement: Prisma driver configuration
The system SHALL configure the generated Prisma 7 client with a MySQL-compatible driver adapter derived from `DATABASE_URL`.

#### Scenario: Valid MySQL connection URL
- **WHEN** `DATABASE_URL` contains a valid MySQL URL with host, credentials, port, and database name
- **THEN** the adapter receives the decoded connection settings and the Prisma Client is created with that adapter

#### Scenario: Default MySQL port
- **WHEN** a valid `DATABASE_URL` omits its port
- **THEN** the adapter uses port `3306`

### Requirement: Development instance reuse
The system SHALL reuse the same Prisma Client instance across repeated module evaluation in a non-production environment.

#### Scenario: Development module reload
- **WHEN** the database module is evaluated again in the same development process
- **THEN** it returns the previously cached Prisma Client instead of creating another client and connection pool

#### Scenario: Production module initialization
- **WHEN** the database module is evaluated in production
- **THEN** it creates a process-scoped client without assigning it to the development global cache

### Requirement: Database configuration validation
The system MUST fail with a clear configuration error when `DATABASE_URL` cannot provide the settings required to construct the database adapter.

#### Scenario: Missing database URL
- **WHEN** the database module initializes without `DATABASE_URL`
- **THEN** initialization fails with an error identifying `DATABASE_URL` as required

#### Scenario: Invalid database URL
- **WHEN** `DATABASE_URL` is malformed, uses a non-MySQL protocol, or omits required connection information
- **THEN** initialization fails before creating the Prisma Client and reports invalid database configuration

### Requirement: Server-only access
The system MUST prevent the database client module from being imported into client-side application code.

#### Scenario: Client component dependency
- **WHEN** client-side code attempts to depend on the database client module
- **THEN** the framework reports a server-only module boundary violation
