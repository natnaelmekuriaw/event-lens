# Self-hosting

Phase 1 supports a source deployment of the dashboard and API with PostgreSQL.
The supplied Compose file runs PostgreSQL only; application container images and
a complete production Compose stack are not supplied.

## Local installation

Follow the [README quickstart](../README.md#local-development). `pnpm setup`
creates the root `.env` without overwriting an existing file. Keep that file
private. Docker Compose persists PostgreSQL in the `postgres-data` volume.

Open `/setup` on the dashboard and enter `BOOTSTRAP_TOKEN` from `.env` to create
the first owner and workspace. This operation is available once per installation.
Sign in at `/login`, create a project, and save its public key when shown. Owners
can invite teammates from the workspace team page and privately share the
`/join#token=...` link. Links expire after 48 hours; recreating an invitation for
the same email replaces the old link.

## Production configuration

Use one API instance behind a private network boundary. Terminate public HTTPS
at a reverse proxy that exposes the Next.js dashboard. Next.js forwards its
`/api` requests to the private API. The API listens on all interfaces, so use
firewall or container/network rules to prevent direct public access to port 3001. Keep PostgreSQL private as well.

Set the following values for the deployment:

| Variable                                            | Purpose                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                                          | `production`                                                             |
| `APP_URL`                                           | Exact public HTTPS dashboard origin, without credentials, path, or query |
| `API_URL`                                           | Private HTTP or HTTPS API origin reachable from Next.js                  |
| `PORT`                                              | API listener port, normally `3001`                                       |
| `DATABASE_URL`                                      | PostgreSQL connection URL for the application                            |
| `BETTER_AUTH_SECRET`                                | Unique random session secret of at least 32 characters                   |
| `BOOTSTRAP_TOKEN`                                   | Unique random initial-owner setup token of at least 32 characters        |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | PostgreSQL container configuration when using the supplied Compose file  |

`APP_URL` must use HTTPS in production. It controls trusted origins and secure
cookies, so use the exact address users open. Preserve the browser's origin at
the reverse proxy. `API_URL` may use HTTP for a trusted loopback or private
container connection; use TLS when traffic crosses an untrusted network. Both
values must be origins without credentials, paths, queries, or fragments.

The API development command loads the root `.env`; Next.js configuration also
loads it. Production API processes need an explicit environment: provide it
through a process supervisor, secret manager, or Node's `--env-file` option.
Build the dashboard with the intended `API_URL`, because its proxy rewrite is
produced at build time. Rebuild after changing this value.

After setting that environment, the operator prepares the deployment:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm build
```

From the repository root, start the API with
`node --env-file=.env apps/api/dist/main.js` and the dashboard with
`pnpm --filter @eventlens/web start`. Run each under a process supervisor with
restart behavior and restricted network access. Configure TLS and log retention
in the host infrastructure. Review [security limitations](../SECURITY.md) before
allowing access.

Use `/api/health/live` to check the API process and `/api/health/ready` to check
its database connection. These paths are also accessible through the dashboard
proxy. Readiness failure should remove the instance from traffic.

## Backup and restore

These examples apply to the supplied PostgreSQL Compose service. Run them as the
installation operator from the repository root. Keep backups outside the
repository, restrict permissions, encrypt copies, and test restoration on an
isolated instance. A Docker volume is not a backup.

Create a consistent logical backup inside the container, then copy it locally:

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/eventlens-backup.dump'
docker compose cp postgres:/tmp/eventlens-backup.dump ./eventlens-backup.dump
```

Move the copied file to protected backup storage and preserve the deployment
configuration and secrets separately. The sample filename is overwritten if
reused; use dated filenames in your backup process.

Restoration replaces matching objects in the target database. Stop application
processes first and confirm that the selected Compose project and database are
the intended restore target. Restore only a trusted backup from a compatible
EventLens revision:

```sh
docker compose cp ./eventlens-backup.dump postgres:/tmp/eventlens-backup.dump
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/eventlens-backup.dump'
```

Apply migrations required by the deployed revision, restart the application,
and check readiness and sign-in. Backup and restore commands are operator
procedures; routine verification does not exercise them. Email password
recovery and an operator password reset workflow are not implemented.

## Verification and upgrades

Run the complete verification entry point against the development environment:

```sh
pnpm verify
```

The script performs setup, database preparation, checks, tests, and builds in
order. Do not point test verification at a production database. Before an
upgrade, review migrations, take a backup, verify the target revision in an
isolated environment, and plan restoration for failures. Analytics benchmarks
start when the event pipeline exists; Phase 1 has no workload benchmark results.
