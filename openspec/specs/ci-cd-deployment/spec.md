## Purpose

Provide a repeatable, auditable path for validating SLAI changes and deploying a successful commit to the PM2-managed service at `slai.studev.net`.

## Requirements

### Requirement: Pull requests are validated on the rollout branch

The CI workflow SHALL run for pull requests whose base branch is `deploy/ci-cd` during the initial rollout phase.

#### Scenario: Pull request targets the rollout branch

- **WHEN** a pull request is opened, synchronized, or reopened with base `deploy/ci-cd`
- **THEN** GitHub Actions runs the repository quality checks using the committed pnpm lockfile
- **AND** no deployment job is started because the event is a pull request

#### Scenario: Pull request targets an unrelated branch

- **WHEN** a pull request has a base branch other than `deploy/ci-cd`
- **THEN** this rollout workflow does not run for that pull request

### Requirement: CI reproduces the production build gate

The CI workflow SHALL use a supported Node.js runtime and the repository's locked pnpm dependency graph, then SHALL pass Prisma client generation and schema validation, type-checking, linting, the complete test suite, and the production build before reporting success.

#### Scenario: All quality checks pass

- **WHEN** the workflow installs dependencies with the lockfile and every configured check succeeds
- **THEN** the CI job reports success and exposes a successful commit status for branch protection

#### Scenario: A quality check fails

- **WHEN** dependency installation, Prisma validation, type-checking, linting, tests, or the production build fails
- **THEN** the CI job reports failure
- **AND** no deployment job is eligible to run for that commit

### Requirement: Successful rollout-branch pushes and approved manual releases are deployed

The deployment workflow SHALL run for a push to `deploy/ci-cd` after the CI gate succeeds, or for an explicitly requested manual release, and SHALL deploy the exact selected commit to the configured server application directory.

#### Scenario: Successful push to the rollout branch

- **WHEN** a commit is pushed to `deploy/ci-cd` and the CI gate for that commit succeeds
- **THEN** the deployment job connects to the configured server over authenticated SSH
- **AND** synchronizes the server checkout to the pushed commit
- **AND** applies existing Prisma migrations non-interactively
- **AND** creates the production build
- **AND** restarts the SLAI process through `/usr/bin/pm2`

#### Scenario: Failed CI for a rollout-branch push

- **WHEN** a commit is pushed to `deploy/ci-cd` but the CI gate fails
- **THEN** the deployment job does not run
- **AND** the currently running PM2 service is left unchanged by GitHub Actions

#### Scenario: Approved manual release

- **WHEN** an operator manually dispatches the workflow with an optional selected commit and passes the protected deployment environment gate
- **THEN** the same quality gate runs against that commit before deployment
- **AND** the deployment job synchronizes and deploys exactly that selected commit

#### Scenario: Pull request attempts to deploy

- **WHEN** a pull request event is received for `deploy/ci-cd`
- **THEN** the workflow performs validation only and SHALL NOT use deployment credentials or invoke SSH/PM2

### Requirement: Deployment secrets stay outside the repository

The workflow SHALL obtain SSH credentials and deployment coordinates from GitHub encrypted secrets or environment-scoped variables, while application runtime secrets SHALL remain on the server and SHALL NOT be written to workflow files, command output, or repository artifacts.

#### Scenario: Required deployment configuration is missing

- **WHEN** a deployment starts without a required SSH secret, host, user, or application path
- **THEN** the deployment fails before changing the server checkout or restarting PM2
- **AND** the failure identifies the missing configuration without printing secret values

#### Scenario: Deployment uses runtime configuration

- **WHEN** the server deployment runs
- **THEN** `DATABASE_URL`, JWT, CLIProxy, model, and other runtime settings are read from the server's configured environment
- **AND** GitHub Actions does not echo their values

### Requirement: The deployed service is verified and recoverable

After restarting PM2, the deployment SHALL verify the configured public service URL and SHALL provide a documented rollback path to a prior successful commit without automatically attempting destructive database rollback.

#### Scenario: Health check succeeds

- **WHEN** the PM2 restart completes and the configured health-check URL responds successfully within the retry window
- **THEN** the deployment job reports success and records the deployed commit and service URL in the job summary

#### Scenario: Health check fails

- **WHEN** the health-check URL remains unsuccessful after the retry window
- **THEN** the deployment job reports failure with actionable PM2/log inspection guidance
- **AND** the workflow does not claim the deployment is healthy

#### Scenario: Operator rolls back an application release

- **WHEN** an operator selects a prior successful commit and reruns the documented deployment procedure
- **THEN** the server is rebuilt from that commit and the PM2 service is restarted with the server runtime environment
- **AND** database migrations are not automatically reversed
