# Self-hosting

EventLens supports source deployment of the dashboard, API, and worker with
PostgreSQL and Redis. Base Compose supplies PostgreSQL/Redis; the production
overlay adds API, worker, dashboard, migrations, and an HTTPS entry point.
Follow [release operations](release-operations.md) for the container deployment
and the required explicit volume selection before starting either Compose mode.

## Local installation

Follow the [README quickstart](../README.md#local-development). `pnpm setup`
creates the root .env without overwriting an existing file. Add newly introduced
settings from .env.example when upgrading an existing installation.

Compose persists PostgreSQL/Redis in operator-selected external volumes using
`EVENTLENS_POSTGRES_VOLUME` and `EVENTLENS_REDIS_VOLUME`. Existing deployments must
select their actual existing mounts, which may have older names. Both listeners bind to loopback. Redis uses append-only
persistence and noeviction; PostgreSQL receipts/outbox remain the recovery source
for pending events even if Redis data is lost.

Open /setup and use BOOTSTRAP_TOKEN from .env to create the first owner/workspace.
Sign in, create a project, and save its public key when shown. Owners privately
share /join#token=... invitations; links expire after 48 hours. Event collection
uses public keys; dashboard management uses session cookies.

`pnpm dev` starts API, dashboard, and worker. Run `pnpm demo` separately to
open the synthetic GalaxyBalls flow on port 3003. Build shared packages before
starting them; follow the README command sequence after contract or pipeline changes.

## Production configuration

Use one API instance. Terminate HTTPS at a reverse proxy for the dashboard.
Next.js forwards /api requests to the private API. SDKs can use the dashboard
origin, or a dedicated HTTPS ingestion origin that routes only /api/v1/ingest to
the API. Keep other API paths private when using a dedicated ingestion origin.

The API listens on all interfaces. Restrict direct access to its listener,
PostgreSQL, and Redis through firewall or container/network rules. The worker
health listener binds to loopback and is intended for local monitoring.

| Variable                                      | Purpose                                                     |
| --------------------------------------------- | ----------------------------------------------------------- |
| NODE_ENV                                      | production                                                  |
| APP_URL                                       | Exact public HTTPS dashboard origin                         |
| API_URL                                       | Private API origin reachable by Next.js                     |
| PORT                                          | API listener, default 3001                                  |
| DATABASE_URL                                  | PostgreSQL connection URL                                   |
| REDIS_URL                                     | Redis/rediss URL; default redis://localhost:6379            |
| WORKER_PORT                                   | Loopback worker health port, default 3002                   |
| EVENT_RETENTION_DAYS                          | Analytics retention, default 90, allowed 7–3650             |
| EVENTLENS_QUEUE_PREFIX                        | Shared API/worker/test queue namespace; default eventlens   |
| BETTER_AUTH_SECRET                            | Unique random session secret of at least 32 characters      |
| BOOTSTRAP_TOKEN                               | Unique random initial-owner token of at least 32 characters |
| POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB | Supplied PostgreSQL container settings                      |

APP_URL must use HTTPS in production and match the origin users open. Preserve
the browser Origin header at the proxy. API_URL can use HTTP on a trusted private
connection; use TLS across untrusted networks. These variables must be origins
without credentials, paths, queries, or fragments.

Use the same PostgreSQL database, Redis database, and queue prefix for a
deployment's worker processes. Use distinct Redis namespaces for separate
installations and test environments. A prefix does not authorize access to Redis;
network restrictions and credentials still apply.

Development commands load root .env. Production API and worker processes need
an explicit environment supplied by a supervisor, secret manager, or Node's
--env-file option. Next.js also loads root .env during configuration. Build the
dashboard using the intended API_URL; rebuild after changing its proxy destination.

After configuring the environment, the operator prepares the deployment:

```sh
pnpm install --frozen-lockfile
docker compose up -d --wait postgres redis
pnpm db:generate
pnpm db:migrate
pnpm build
```

Run these as separate supervised processes from the repository root:

```sh
node --env-file=.env apps/api/dist/main.js
node --env-file=.env apps/worker/dist/main.js
pnpm --filter @eventlens/web start
```

Configure restarts, private network access, TLS, proxy request/body limits, and
log retention. The SDK already batches requests, but rate limits are local to one
API process and socket peers can represent many users behind a proxy.

## Health and failure handling

API /api/health/live checks its process; /api/health/ready checks PostgreSQL.
Those paths are available through the dashboard proxy. Worker /health/live and
/health/ready are on loopback port 3002. Worker readiness includes dependency
access and recent successful outbox dispatch. API readiness can succeed while
Redis is unavailable because ingestion can still commit durable pending receipts.

Monitor both readiness endpoints, PostgreSQL disk usage, Redis memory, pending
receipt counts, and terminal failures. Restore Redis/worker connectivity to
resume dispatch from the outbox. Owners/admins can inspect and replay retained
failures in the explorer. See [event operations](events.md) for exact retry,
identity, and retention rules.

During maintenance, stop or drain public ingestion first. Allow workers to finish
current jobs before stopping them. Accepted pending receipts survive process
restarts. Configure enough shutdown time for active work; abrupt termination
requires later redelivery.

## Backup and restore

Run these procedures as the installation operator against the intended Compose
project. Keep encrypted backups outside the repository and test restore on an
isolated instance. A Docker volume is not a backup.

Create a consistent PostgreSQL logical backup and copy it locally:

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/eventlens-backup.dump'
docker compose cp postgres:/tmp/eventlens-backup.dump ./eventlens-backup.dump
```

Move it into protected backup storage. Preserve deployment configuration/secrets
separately, and use unique dated filenames in the backup process. The database
contains accounts, receipts/outbox, analytics events, and identity links. Pending
outbox work can reconstruct Redis delivery after restoration; Redis history is
not the durable source of event payloads.

Restore into a fresh database with the compatible schema/application version.
Stop API and worker processes and confirm the fresh target database/project before
using a trusted compatible backup. Replace `FRESH_TARGET_DATABASE` explicitly:

```sh
docker compose cp ./eventlens-backup.dump postgres:/tmp/eventlens-backup.dump
docker compose exec -T postgres sh -c 'pg_restore --no-owner --exit-on-error -U "$POSTGRES_USER" -d FRESH_TARGET_DATABASE /tmp/eventlens-backup.dump'
```

Use a fresh, isolated queue namespace after database restoration so queued
receipt IDs from a different database history cannot collide. Set the same new
EVENTLENS_QUEUE_PREFIX for restarted workers. Apply required migrations, restart
services, check health/sign-in, and watch pending work drain. Invalidate restored
sessions, invitations, and verification tokens before reopening traffic, as
described in [release operations](release-operations.md#backup-restore-and-upgrades).
The full verification flow now includes an isolated dump/restore acceptance case.

## Verification, benchmarks, and upgrades

The shared entry point is:

```sh
pnpm verify
```

It creates disposable PostgreSQL/Redis infrastructure and runs checks, tests,
builds, benchmarks, recovery, production containers, and an advisory review in order.
It does not load or migrate the application database configuration. The owner
executes Docker, database operations, full runtime checks, and benchmarks.

Standalone ingestion measurement requires an explicitly selected disposable
project and BENCHMARK_API_URL/BENCHMARK_PROJECT_KEY; an optional output path saves
the report. Acceptance measurements cover the PostgreSQL acknowledgement path.
They do not establish end-to-end worker latency or production capacity.

Before upgrading, review migrations, take a backup, verify the revision in an
isolated environment, and plan restore. Keep receipt tombstones/backups in your
retention policy: analytics cleanup does not implement complete actor erasure.
Use the operator account recovery procedure and production Compose overlay in
[release operations](release-operations.md). Measured workload results still need
review on the release revision; no general production capacity is claimed.
