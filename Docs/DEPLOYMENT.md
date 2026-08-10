# SLAI deployment

The repository contains separate GitHub Actions workflows for the `master` branch. Pull requests targeting `master` run CI only. A push to `master` starts CD, which calls the reusable CI quality gate before deployment. A protected manual CD dispatch may deploy a selected commit after that same quality gate succeeds.

The workflows are [.github/workflows/ci.yml](../.github/workflows/ci.yml) and [.github/workflows/cd.yml](../.github/workflows/cd.yml). The PM2 process definition is [ecosystem.config.cjs](../ecosystem.config.cjs).

## GitHub configuration

Create a GitHub Environment named `slai-deploy`. Add required reviewers to this environment before enabling manual dispatch or production-like deployment.

Environment secrets:

- `DEPLOY_SSH_PRIVATE_KEY`: private key for a deploy-only server user. The matching public key must be authorized on the server.
- `DEPLOY_KNOWN_HOSTS`: pinned `known_hosts` line(s) for the deployment host. Do not generate this value inside the workflow with an unchecked `ssh-keyscan`.
- `DEPLOY_HOST`: server hostname or IP address.
- `DEPLOY_USER`: non-root SSH user that owns the application checkout and PM2 process.

Environment variables:

- `DEPLOY_PATH`: absolute path to the dedicated server checkout, for example `/var/www/slai`.
- `APP_PORT`: PM2 listener port; defaults to `3000`.
- `HEALTHCHECK_URL`: public URL checked after restart; defaults to `https://slai.studev.net/`.

The application values in `.env.example` are not GitHub Actions secrets. Put real values in the server-local environment only:

- `DATABASE_URL`
- `JWT_SECRET`
- `CLIPROXY_PROVIDER`
- `CLIPROXY_BASE_URL`
- `CLIPROXY_API_KEY`
- `SLIDE_MODEL_ID`

Never add the server `.env`, private keys, or database credentials to the repository or print them in workflow output. Rotate the deploy key and update `DEPLOY_KNOWN_HOSTS` when the server identity changes.

## Server preflight

Run these checks as the deploy user and use a dedicated checkout path. Do not point `DEPLOY_PATH` at a home directory or an unrelated working tree.

```bash
node --version       # Node.js 22.22.2+
pnpm --version       # pnpm 10.x
git --version
test -x /usr/bin/pm2
test -d /var/www/slai/.git
```

The deploy user must be able to fetch the repository from `origin`, read the server-local runtime environment, connect to MariaDB/MySQL through `DATABASE_URL`, and run `/usr/bin/pm2`. The checkout must be writable by that user because each release synchronizes it to the exact workflow SHA.

After the first manual PM2 start, configure PM2 startup integration for the server's normal boot process and run `/usr/bin/pm2 save` as the PM2 user. The workflow also saves the process list after a successful restart.

## Cloudflare Tunnel and TLS

The Cloudflare Tunnel public hostname for `slai.studev.net` must route to the same local service port used by PM2. For the current setup:

```text
Public hostname: slai.studev.net
Service: http://localhost:3000
```

Cloudflare manages the public DNS and TLS for the hostname. If `APP_PORT` changes, update the Tunnel service URL to match it.

## Release flow

1. Create or update a pull request targeting `master` and wait for CI.
2. Merge or push the approved commit to `master`.
3. CD calls the reusable CI quality gate again for the exact push commit.
4. GitHub Actions connects over SSH, fetches the repository refs, verifies the exact SHA, runs `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm db:deploy`, and `pnpm build`.
5. The workflow runs `/usr/bin/pm2 startOrRestart ecosystem.config.cjs --update-env` and saves the PM2 process list.
6. The CD workflow retries `https://slai.studev.net/` (or `HEALTHCHECK_URL`) and records the SHA in the job summary. This check is temporarily non-blocking while the public hostname is being finalized.

If deployment fails before PM2 restart, the existing process is not intentionally restarted by the workflow. If the health check fails after restart, inspect the service as the deploy user:

```bash
/usr/bin/pm2 status
/usr/bin/pm2 logs slai --lines 200
```

## Rollback

Use CD workflow manual dispatch with a prior successful CI commit SHA, approve the `slai-deploy` environment, and let the deployment path run against that SHA. An equivalent controlled SSH procedure may be used when GitHub Actions is unavailable.

Prisma migrations are forward-only in this workflow. Do not run `prisma migrate reset` or an automatic down-migration in production. Before rolling back application code, confirm that the prior build remains compatible with the already-applied schema; a schema repair requires a separately reviewed forward migration.

Keep deployment credentials restricted to the protected environment and do not add a pull-request event to the deployment workflow.
