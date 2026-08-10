## Why

SLAI currently has reproducible application checks and a production start command, but no shared automation for validating pull requests or promoting a known commit to the server. This change establishes a safe first deployment path on `deploy/ci-cd`, using GitHub Actions and the server's existing PM2 installation, so the workflow can be exercised before it is applied to pull requests targeting `master`.

## What Changes

- Add a GitHub Actions CI workflow for the current `deploy/ci-cd` test branch that installs the locked pnpm dependency graph and runs Prisma generation/validation, type-checking, linting, tests, and the production build.
- Add a gated deployment job that runs only after CI succeeds for a push to `deploy/ci-cd` or an explicitly approved manual release; pull requests must never deploy.
- Deploy over SSH to a configured application directory on the server, apply committed Prisma migrations non-interactively, build the Next.js app, and restart the service through `/usr/bin/pm2` with updated environment variables.
- Define the required GitHub secrets/variables, remote deployment assumptions, and rollback/health-check procedure without placing application secrets in the repository or workflow logs.
- Verify the deployed service through `https://slai.studev.net` after restart, with a configurable health-check path and a clear failure signal.
- Keep the workflow's branch filters explicit so the later migration to all pull requests targeting `master` is a small, intentional trigger change.

## Capabilities

### New Capabilities

- `ci-cd-deployment`: Validate code in GitHub Actions and deploy successful commits from the staging branch to the PM2-managed SLAI service.

### Modified Capabilities

- None.

## Impact

- Adds workflow files under `.github/workflows/` and a PM2 process definition or equivalent start contract in the repository.
- Uses the existing pnpm scripts (`db:generate`, `db:validate`, `db:deploy`, `build`, and `start`) and the existing Prisma migrations; no application API contract changes are required.
- Requires GitHub Actions secrets/variables for SSH access, the remote path, and deployment health-check configuration, plus server-side environment configuration for `DATABASE_URL`, JWT, CLIProxy, and model settings.
- Requires the server to have Node.js/pnpm, a checked-out repository with access to `origin`, `/usr/bin/pm2`, and a reverse proxy/DNS route for `slai.studev.net` to the PM2 listener.
