## Context

The repository is a single Next.js 16 App Router application using Node.js 20.9+ as its documented minimum, pnpm with a lockfile format compatible with pnpm 10, Prisma 7 with MySQL/MariaDB, and an existing production `start` script. There is no workflow, PM2 ecosystem file, health endpoint, or deployment script in the repository today. The requested server already exposes PM2 at `/usr/bin/pm2`; the public route is `https://slai.studev.net`.

## Goals / Non-Goals

**Goals:**

- Make pull-request quality checks reproducible and required before rollout-branch deployment.
- Exercise the complete path first on `deploy/ci-cd`.
- Deploy the exact Git commit over SSH, use server-side runtime secrets, run forward Prisma migrations, build Next.js, restart the named PM2 process, and verify the public URL.
- Keep the later switch from rollout-branch PR checks to `master` explicit and low-risk.

**Non-Goals:**

- Provisioning the server, Node.js, pnpm, MariaDB, PM2, SSH accounts, TLS, DNS, or a reverse proxy.
- Moving runtime secrets into GitHub or changing application API behavior.
- Automatic database down-migrations, blue/green releases, containers, or a new hosting platform.

## Decisions

### One workflow with separate quality and deployment jobs

Use one `.github/workflows/ci-cd.yml` with a `quality` job and a `deploy` job. The workflow initially listens for pull requests targeting `deploy/ci-cd`, pushes to `deploy/ci-cd`, and manual dispatch for controlled recovery. The deploy job has `needs: quality` and a push/manual condition, so a pull request can never reach SSH or PM2. The branch filters stay in one visible location; when rollout is accepted, the pull-request target is changed to `master` in a deliberate follow-up.

**Alternative considered:** separate CI and CD files. This can be useful at larger scale, but a single gated workflow keeps the initial branch experiment and commit-level dependency obvious.

### Pin the runtime used by CI

Use Node.js 20.x to match the README minimum and pnpm 10.x to match the current lockfile/tooling. Dependency installation uses `pnpm install --frozen-lockfile`. The quality job runs the existing scripts in a deterministic order: `pnpm db:generate`, `pnpm db:validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. CI supplies non-production values only where Prisma/Next.js require environment presence.

**Alternative considered:** testing only `pnpm build`. That misses the repository's existing type, lint, unit, and schema checks and would allow regressions to reach the server.

### Keep deployment state on the server

The GitHub runner authenticates with a deploy-only SSH key and connects to a server-side checkout under a configured `DEPLOY_PATH`. The remote command verifies the path, checks out the pushed SHA (or fetches the rollout branch and verifies the SHA), installs with the frozen lockfile, generates Prisma, runs `pnpm db:deploy`, builds, and only then restarts the service. The server's `.env`/process environment supplies `DATABASE_URL`, `JWT_SECRET`, `CLIPROXY_*`, and `SLIDE_MODEL_ID`.

**Alternative considered:** uploading a `.env` from GitHub Actions. This increases secret exposure and couples runtime configuration to CI; server-local secrets are safer for this deployment model.

### Manage the service through a committed PM2 contract

Add an ecosystem configuration naming the service `slai`, setting the application working directory and production port, and starting the existing `pnpm start`/Next production server. The deploy command invokes `/usr/bin/pm2 startOrRestart <ecosystem-file> --update-env`, then persists the PM2 process list if the server uses startup integration. The exact port is configurable so the existing reverse proxy can continue routing `slai.studev.net` to it.

**Alternative considered:** invoking `pm2 restart` with an implicit process name. A committed ecosystem contract makes the process name, working directory, and environment behavior reviewable and repeatable.

### Verify through the public domain

After restart, poll a configurable `HEALTHCHECK_URL`, defaulting to `https://slai.studev.net/`, with bounded retries and a short timeout. The workflow summary records the SHA and URL but never runtime secret values. A failed check fails the job and points operators to `/usr/bin/pm2 status`, `/usr/bin/pm2 logs slai`, and the documented prior-commit redeploy procedure.

### Treat migrations as forward-only release steps

Run the existing `pnpm db:deploy` command during release, never `db:migrate`, and never automatically reverse migrations during rollback. Releases must use additive/backward-compatible migrations when possible; an application rollback may require a separately planned database compatibility fix.

## Risks / Trade-offs

- [SSH key or host-key misconfiguration] → Store a deploy-only private key and pinned `known_hosts` value in an environment-scoped secret; fail before remote mutation if either is missing.
- [Build succeeds while the public service is unavailable] → Require a bounded HTTPS health check after PM2 restart and surface PM2 logs on failure.
- [A migration is not backward-compatible with the previous build] → Run migrations before restart, document forward-only rollback, and require migration review as part of CI.
- [Server checkout contains uncommitted files or wrong ownership] → Validate the configured path and document that it is a dedicated deploy checkout owned by the deploy user; do not touch unrelated directories.
- [Concurrent pushes race on one server] → Serialize deployments with a GitHub Actions concurrency group for the environment and make the remote release operate on the exact workflow SHA.
- [The public root route changes behavior] → Keep the health-check URL configurable and allow a future lightweight health route without changing the deployment contract.

## Migration Plan

1. Create the workflow, PM2 ecosystem file, deployment documentation, and any small helper script required by the tasks.
2. Create the `deploy/ci-cd` branch from the intended application commit and push it.
3. Configure the GitHub environment/secrets and the server-side checkout, runtime environment, reverse proxy, and PM2 startup integration.
4. Open a test pull request targeting `deploy/ci-cd` and confirm all quality checks pass without SSH activity.
5. Push/merge the tested commit to `deploy/ci-cd`, confirm deployment, PM2 status, logs, and `https://slai.studev.net` health.
6. For rollback, redeploy a prior successful SHA through manual dispatch or the documented SSH procedure; inspect database compatibility before any application rollback.
7. After explicit acceptance, update the pull-request trigger from `deploy/ci-cd` to `master` and preserve deployment-on-push behavior according to the release policy.

## Open Questions

- The final server `DEPLOY_PATH`, deploy user, listener port, and exact GitHub environment name are deployment-specific values; they can be set as secrets/variables without changing this contract.
