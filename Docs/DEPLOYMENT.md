# SLAI deployment

The repository contains the first GitHub Actions rollout for the `deploy/ci-cd` branch. Pull requests targeting that branch run the quality gate only. A push to `deploy/ci-cd` deploys after the quality gate succeeds. A protected manual dispatch may deploy a selected commit for recovery.

The workflow is [.github/workflows/ci-cd.yml](../.github/workflows/ci-cd.yml). The PM2 process definition is [ecosystem.config.cjs](../ecosystem.config.cjs).

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
node --version       # Node.js 20.9+
pnpm --version       # pnpm 10.x
git --version
test -x /usr/bin/pm2
test -d /var/www/slai/.git
```

The deploy user must be able to fetch the repository from `origin`, read the server-local runtime environment, connect to MariaDB/MySQL through `DATABASE_URL`, and run `/usr/bin/pm2`. The checkout must be writable by that user because each release synchronizes it to the exact workflow SHA.

After the first manual PM2 start, configure PM2 startup integration for the server's normal boot process and run `/usr/bin/pm2 save` as the PM2 user. The workflow also saves the process list after a successful restart.

## Reverse proxy and TLS

DNS for `slai.studev.net` must point to the server, and TLS must terminate at the existing reverse proxy. The proxy must forward to the same `APP_PORT` used by PM2. For an Nginx setup, the relevant shape is:

```nginx
server {
    listen 443 ssl http2;
    server_name slai.studev.net;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use the server's existing certificate management and add an HTTP-to-HTTPS redirect if it is not already present. The example is a configuration reference; it does not change the server automatically.

## Release flow

1. Create or update a pull request targeting `deploy/ci-cd` and wait for the quality gate.
2. Merge or push the approved commit to `deploy/ci-cd`.
3. GitHub Actions connects over SSH, fetches the repository refs, verifies the exact SHA, runs `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm db:deploy`, and `pnpm build`.
4. The workflow runs `/usr/bin/pm2 startOrRestart ecosystem.config.cjs --update-env` and saves the PM2 process list.
5. The workflow retries `https://slai.studev.net/` (or `HEALTHCHECK_URL`) and records the SHA in the job summary.

If deployment fails before PM2 restart, the existing process is not intentionally restarted by the workflow. If the health check fails after restart, inspect the service as the deploy user:

```bash
/usr/bin/pm2 status
/usr/bin/pm2 logs slai --lines 200
```

## Rollback

Use workflow manual dispatch with a prior successful commit SHA, approve the `slai-deploy` environment, and let the same quality/build/deploy path run against that SHA. An equivalent controlled SSH procedure may be used when GitHub Actions is unavailable.

Prisma migrations are forward-only in this workflow. Do not run `prisma migrate reset` or an automatic down-migration in production. Before rolling back application code, confirm that the prior build remains compatible with the already-applied schema; a schema repair requires a separately reviewed forward migration.

## Moving PR checks to `master`

After the rollout branch has been accepted, update the `pull_request.branches` list in `.github/workflows/ci-cd.yml` from:

```yaml
branches:
  - deploy/ci-cd
```

to:

```yaml
branches:
  - master
```

Keep deployment credentials restricted to the protected environment and do not add a pull-request event to the deployment condition.
