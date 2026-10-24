# Deployment and recovery

The supported topology is one API, one worker, one dashboard, PostgreSQL 17,
Redis 8, and a Caddy HTTPS entry point on one Docker host. Application images run
as the unprivileged `node` user. Source deployment remains supported by the
[self-hosting guide](self-hosting.md). A full successful `pnpm verify` run on
the release revision is required before publishing a release candidate.

## Existing installations: select storage explicitly

The infrastructure Compose file now requires **existing external volumes**.
It fails when their names are missing or the selected volumes do not exist.
This prevents a renamed Compose project from silently creating an empty database
or sharing a different installation's storage.

Before changing an existing deployment, take a backup, stop application traffic,
and inspect its actual PostgreSQL/Redis mounts as the operator:

```sh
docker compose ps -q postgres
docker inspect YOUR_POSTGRES_CONTAINER --format '{{json .Mounts}}'
docker volume ls
```

Set `EVENTLENS_POSTGRES_VOLUME` and `EVENTLENS_REDIS_VOLUME` in `.env` to those
exact existing names. Older checkouts may use `eventlens_postgres-data`,
`eventlens-postgres`, or a project-specific name. Do not infer the correct volume
from a warning or create a replacement volume during an upgrade. Inspect the
container mount and confirm the expected database contents first. Stop the old
database container before attaching its volume to another PostgreSQL container.
No automatic volume rename, deletion, copying, or PostgreSQL major upgrade occurs.

For a **new** installation only, create uniquely named volumes and put these same
names in `.env`:

```sh
docker volume create my-eventlens-postgres
docker volume create my-eventlens-redis
```

Use different names, Compose project names, ports, credentials, and queue namespaces
for independent installations. `docker compose down` preserves these external
database volumes; their lifecycle belongs to the operator.

## Production containers

Run `pnpm setup` once to generate secrets, then supply these settings in `.env`:

```dotenv
APP_URL=https://analytics.example.com
EVENTLENS_HOST=analytics.example.com
EVENTLENS_BIND=0.0.0.0
EVENTLENS_HTTPS_PORT=443
EVENTLENS_HTTP_PORT=80
EVENTLENS_POSTGRES_VOLUME=my-eventlens-postgres
EVENTLENS_REDIS_VOLUME=my-eventlens-redis
EVENTLENS_DATABASE_URL=postgresql://eventlens:YOUR_POSTGRES_PASSWORD@postgres:5432/eventlens
EVENTLENS_QUEUE_PREFIX=eventlens
```

Keep the generated `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, and `BOOTSTRAP_TOKEN`.
The internal database URL must match PostgreSQL credentials/database settings.
URL-encode credentials if they contain reserved URL characters. The generated hex
password needs no encoding. Keep `.env` private; never commit it or pass it to
untrusted build contexts. `.dockerignore` excludes environment files, backups,
local dependencies, generated clients, and test artifacts.

After DNS and firewall configuration, the operator runs:

```sh
docker compose -p my-eventlens -f compose.yaml -f compose.production.yaml up -d --build --wait
```

The one-shot `migrate` service completes before the API/worker start. Caddy exposes
the dashboard and same-origin API proxy, with automatic public TLS for a real
domain. For local evaluation, defaults use `https://localhost:8443` and Caddy's
local certificate authority. Trust that local CA only on your development device;
certificate checks are bypassed only by the disposable acceptance browser.

The API, worker, and web containers publish no host ports. The base infrastructure
file publishes PostgreSQL/Redis only on loopback. Do not expose those listeners
through public firewall rules or an untrusted tunnel. The worker health listener
is loopback inside its container. Production images pin Node/infrastructure
digests, install the committed pnpm lockfile, and retain Prisma tooling for
migrations and operator recovery. Rebuild to update the compiled dashboard proxy
destination (`http://api:3001`). Never scale the API without redesigning admission
state and requalifying database/report concurrency.

## Recover an existing account

Recovery requires privileged access to the database and application runtime.
It is an operator command, with no public recovery endpoint. Stop the API to
prevent concurrent sign-ins, and run it interactively using the deployment's
existing environment:

```sh
docker compose -p my-eventlens -f compose.yaml -f compose.production.yaml stop api
docker compose -p my-eventlens -f compose.yaml -f compose.production.yaml run --rm --no-deps api node apps/api/dist/recover-account.js
```

The command prints only the target host/database, prompts for the existing email
and two hidden password entries, replaces the maintained auth credential hash,
and revokes all sessions for that account in one transaction. Passwords must be
12–128 characters. Password arguments and noninteractive input are rejected.
Memberships and closed bootstrap/signup remain unchanged. Restart the API and
verify the old password fails and the new password succeeds.

For source deployments, stop the supervised API and use
`node --env-file=.env apps/api/dist/recover-account.js` from the repository root.

## Backup, restore, and upgrades

Use the logical dump commands in [self-hosting](self-hosting.md#backup-and-restore).
Back up deployment secrets separately and keep encrypted backups off the Docker
host. Include Caddy data/configuration in the operating backup policy if local
CA continuity matters. Record source revision, image digests, schema version,
PostgreSQL major version, and backup time alongside each backup.

Before an upgrade: stop ingestion/application processes, back up the database,
rehearse the new revision against a fresh isolated restore, review migrations,
then deploy. Phase 6 exercises upgrade from the Phase 2 migration history to the
current schema. It also checks transactional DDL failure rollback. This does not
guarantee rollback of arbitrary nontransactional migrations.

If migration fails, stop deployment and preserve diagnostics. Do not repeatedly
edit migration history or run a destructive reset on the original database.
Restore a trusted compatible backup into a **fresh database**, select compatible
application images, and validate there before switching traffic. A failed
nontransactional migration may have partial effects; automatic down migrations
are not provided.

Before reopening a restored deployment:

1. Keep API and workers stopped; verify the fresh target database and backup identity.
2. Invalidate restored sessions, outstanding invitations, and verification tokens
   so old database state cannot reactivate previously revoked access.
3. Choose a fresh `EVENTLENS_QUEUE_PREFIX` shared by API/worker. Do not reuse jobs
   from a different database history. Apply the required compatible migrations.
4. Check sign-in, membership boundaries, analytics, conversion paths, retention,
   pending outbox completion, and duplicate delivery. Then resume traffic.

The operator can invalidate restored auth state using a database transaction on
the **confirmed fresh restore target**:

```sql
BEGIN;
DELETE FROM "Session";
DELETE FROM "Invitation";
DELETE FROM "Verification";
COMMIT;
```

Keep the original deployment and backup available until acceptance finishes.
Restoring a database is a deliberate operator operation, never part of normal startup.

## Shutdown and operational limits

API/worker shutdown hooks handle SIGTERM/SIGINT. Worker shutdown stops dispatch,
waits for active processing, closes queue connections, and disconnects PostgreSQL.
A 25-second application deadline exits with failure if draining stalls; Compose
allows 30 seconds before forcing termination. Durable receipts/outbox support later
redelivery, and generation/status checks keep effects idempotent.

Database statements have a 10-second timeout and one-second lock timeout. Report
transactions use repeatable-read snapshots, four concurrent report slots per API,
a 10-second application budget, and a 12-second transaction backstop. Busy reports
return 429; timed-out reports return 408. Narrow the range and retry. The dashboard
combines its 15-second timeout with caller cancellation.

Monitor worker readiness plus `oldestPendingAgeSeconds` and
`oldestExpiredAgeSeconds` on its private health endpoint. A healthy process is not
proof of an acceptable backlog. Default dispatch and cleanup budgets remain
100 receipts per tick and 1,000 expired events per minute; the qualification
reports measure catch-up without silently increasing these budgets.

## Verification and evidence

`pnpm verify` does not load the application `.env` or migrate its database. It
creates a randomly named Docker project with separate credentials, database,
Redis, dynamic loopback database ports, and disposable project volumes. Web tests
reserve localhost ports 3000–3003; production acceptance also reserves 8080/8443.
An occupied port is an error. The script checks its control-database sentinel on
success/failure, terminates owned child process trees on interruption, and removes
only its generated Compose project/volumes. POSIX hosts require `ps` for descendant
discovery, including browser servers that create their own process groups. A hard OS kill may leave that project
for manual inspection and cleanup; production external volumes are never selected.
The generated private `.tmp/eventlens_verify_....env` is retained if cleanup fails
or the process is killed. After confirming the exact generated project name, use
its printed environment-file path for cleanup:

```sh
docker compose -p GENERATED_PROJECT --env-file .tmp/GENERATED_PROJECT.env -f compose.verify.yaml -f compose.production.yaml down --volumes --remove-orphans
```

This command is exclusively for the generated `eventlens_verify_...` project.
Keep the recovery file private and remove it after that disposable project is gone.

The ordered flow includes offline checks, integration/browser tests, historical
query qualification, dump/restore and account recovery, schema upgrade, HTTPS
containers, forced worker loss at a database-lock checkpoint, Redis state loss,
continued durable ingestion during Redis outage, restart/drain checks, a sustained
ingestion trial, and an advisory check of all shipped JavaScript dependencies,
including build tooling retained in the images. The operator runs
Docker/database commands, full tests, benchmarks, and push.

Revision-linked artifacts are `.tmp/benchmark-*.json` and
`.tmp/release-rehearsal.json`. Synthetic dashboard screenshots are generated in
`.tmp/screenshots/` and uploaded by CI. Review them before publishing README
screenshots; no unexecuted screenshot or measurement is presented as evidence.
See [performance qualification](performance.md) for workload interpretation.

High-severity dependency advisories fail verification. Do not bypass that gate to
publish: review the advisory, update compatible locked dependencies, and rerun.
CI actions and base images use immutable references checked against their upstream
repositories/registry on 2026-10-24; Dependabot proposes subsequent updates.
