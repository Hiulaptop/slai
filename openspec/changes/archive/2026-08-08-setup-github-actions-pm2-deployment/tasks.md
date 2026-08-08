## 1. GitHub Actions quality gate

- [x] 1.1 Add the repository's supported Node.js and pnpm versions to the CI contract, pinning a pnpm 10 release compatible with `pnpm-lock.yaml`.
- [x] 1.2 Create `.github/workflows/ci-cd.yml` with pull-request and push filters limited to `deploy/ci-cd` for the initial rollout, plus manual dispatch for controlled recovery.
- [x] 1.3 Implement the `quality` job with frozen dependency installation and the existing `db:generate`, `db:validate`, `typecheck`, `lint`, `test`, and `build` commands.
- [x] 1.4 Supply only non-production CI environment values required for Prisma/Next.js checks, declare least-privilege workflow permissions, and ensure logs cannot expose runtime secrets.
- [x] 1.5 Add workflow concurrency for the deployment environment and make the deployment job depend on the successful `quality` job.

## 2. PM2 deployment contract

- [x] 2.1 Add a committed PM2 ecosystem configuration for the `slai` process, production mode, configurable listener port, repository working directory, and the existing Next.js production start command.
- [x] 2.2 Implement the deployment job's SSH setup using a deploy-only key and pinned `known_hosts`, with preflight validation for host, user, application path, and required server commands.
- [x] 2.3 Implement the remote release sequence against the exact workflow SHA: synchronize the dedicated checkout, run `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm db:deploy`, and `pnpm build`, then invoke `/usr/bin/pm2 startOrRestart` with `--update-env`.
- [x] 2.4 Ensure failed install, migration, or build steps stop before PM2 restart and leave the current process running; persist the PM2 process list when server startup integration requires it.

## 3. Secrets, server, and domain setup

- [x] 3.1 Document the GitHub environment secrets/variables for SSH private key, host key, host, user, `DEPLOY_PATH`, listener port, and `HEALTHCHECK_URL`, including safe handling and rotation guidance.
- [x] 3.2 Document the server preflight: Node.js/pnpm versions, repository checkout and ownership, server-local `.env` values, `/usr/bin/pm2`, PM2 startup integration, and database connectivity.
- [ ] 3.3 Configure the reverse proxy and DNS/TLS route so `slai.studev.net` forwards to the PM2 listener without moving TLS or application secrets into GitHub Actions.
- [x] 3.4 Document the initial `deploy/ci-cd` branch setup and the later, explicit trigger change for pull requests targeting `master`.

## 4. Health checks and recovery

- [x] 4.1 Add a bounded HTTPS health check after PM2 restart, defaulting to `https://slai.studev.net/`, and write the deployed SHA and URL to the GitHub job summary on success.
- [x] 4.2 Add actionable failure output for the health check, including `/usr/bin/pm2 status`, `/usr/bin/pm2 logs slai`, and server-side log locations without printing secrets.
- [x] 4.3 Document application rollback by redeploying a prior successful commit through manual dispatch or SSH, and explicitly warn that Prisma migrations are forward-only and are not automatically reversed.

## 5. Verification and rollout

- [x] 5.1 Run the same quality commands locally and validate the workflow YAML before committing the deployment change.
- [ ] 5.2 Open a pull request targeting `deploy/ci-cd` and verify that all quality checks run while SSH credentials remain unused.
- [ ] 5.3 Push the approved commit to `deploy/ci-cd`, verify the remote SHA, Prisma migration result, PM2 process status/logs, and `https://slai.studev.net` response.
- [ ] 5.4 Exercise one controlled failure path and one prior-commit rollback path, then record the observed recovery steps in the deployment documentation.
