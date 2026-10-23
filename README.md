# EventLens

EventLens is a self-hosted product analytics platform for understanding what users
do, which features they use, and where they drop off.

EventLens includes account and project management, browser and Node event
collection, durable ingestion, event exploration, analytics, and conversion paths.
Cohort retention remains a later phase.

## Current features

- Protected first-owner setup, email/password sessions, and password changes.
- Workspaces with owner, admin, and viewer roles; expiring private invitations.
- Projects with reporting timezones and rotatable public ingestion keys.
- TypeScript SDK with explicit tracking and identity, bounded batches, retries,
  reset, and opt-out; no automatic page or DOM capture.
- PostgreSQL receipts and transactional outbox, Redis/BullMQ delivery, idempotent
  processing, retained failure status, and owner/admin replay.
- Project event explorer with filters, event details, pagination, live polling,
  processing counts, and failure controls.
- Project analytics with trends, active users, top events, and activity timelines.
- Saved conversion paths with ordered event steps, optional property filters,
  completion windows, and exact conversion counts.
- GalaxyBalls demo, migrations, health endpoints, CI, and one verification script.

Public signup is disabled. Invitation links are shared privately; EventLens does
not send email. Public project keys accept untrusted event submissions and cannot
read or manage workspace data.

## Local development

Use a supported Node.js version from `package.json`, pinned pnpm, and Docker
Compose v2. In PowerShell, if `pnpm` is unavailable, create the Corepack shim and
add it to the current terminal's path. Run each command on its own line:

```powershell
& "C:\Program Files\nodejs\corepack.cmd" enable --install-directory "$env:APPDATA\npm" pnpm
$env:Path = "$env:APPDATA\npm;$env:Path"
pnpm.cmd --version
```

Run the following from the EventLens repository root:

```sh
pnpm install
pnpm setup
docker compose up -d --wait postgres redis
pnpm db:generate
pnpm db:migrate
pnpm --filter @eventlens/contracts --filter @eventlens/database --filter @eventlens/pipeline --filter @eventlens/sdk build
pnpm dev
```

`pnpm setup` creates a private root `.env` with random secrets and keeps an
existing file. When upgrading from Phase 1, add the new nonsecret values from
`.env.example`: `REDIS_URL`, `WORKER_PORT`, and `EVENT_RETENTION_DAYS`.
Their defaults work with local Compose.

Open [owner setup](http://localhost:3000/setup), read `BOOTSTRAP_TOKEN` from
your local `.env`, and create the first owner and workspace. Setup closes after
initialization. Sign in, create a project, and save its public key when shown.

The dashboard runs on port 3000, the API on 3001, and the worker health server on
loopback port 3002. Dashboard requests use its same-origin `/api` proxy. See
[API docs](http://localhost:3000/api/docs). Compose runs PostgreSQL and Redis;
application processes run through pnpm and load the root `.env` in development.

In another terminal, run:

```sh
pnpm demo
```

Open [GalaxyBalls](http://localhost:3003), enter `http://localhost:3001` and a
public project key, then start a game and complete a level. Open the project's
**Events** page and refresh or enable live updates. A 202 acceptance means the
batch committed to PostgreSQL; the worker makes it visible in the explorer.
Open **Analytics** for trends or **Conversion paths** to save and inspect a
sequence such as `game_started` → `level_completed`.

## SDK

The SDK is a workspace package, `@eventlens/sdk`; no public registry release is
supplied. Use an endpoint base URL; the SDK appends `/api/v1/ingest`.

```ts
import { createEventLens } from '@eventlens/sdk';

const analytics = createEventLens({
  endpoint: 'https://analytics.example.com',
  projectKey: 'el_pk_your_public_project_key',
});

analytics.track('level_completed', { level: 1, score: 100 });
analytics.identify('synthetic-player-42');
await analytics.flush();
```

See the [SDK guide](docs/sdk.md) for Node identity isolation, buffering,
retry/drop behavior, storage, opt-out, and shutdown.

## Verification

The repository owner runs Docker, database operations, the complete test suite,
and benchmarks through the shared entry point:

```sh
pnpm verify
```

It reports progress, stops on failure, and uses isolated test state. It requires
Docker and access to the package registry and browser downloads. Set
`PLAYWRIGHT_CHANNEL=chrome` or `msedge` in the environment or local `.env`
to use an installed browser. Focused offline checks can run during implementation.

Full runtime checks and benchmark measurements require executing this command
against this revision; no performance figures are claimed here.

## Repository guide

| Path                 | Responsibility                                            |
| -------------------- | --------------------------------------------------------- |
| `apps/web`           | Dashboard and same-origin API proxy                       |
| `apps/api`           | Sessions, tenant access, ingestion, and management API    |
| `apps/worker`        | Outbox dispatch, processing, retention, and worker health |
| `packages/contracts` | Shared validation and response types                      |
| `packages/database`  | Prisma schema, migrations, and client                     |
| `packages/pipeline`  | Queue, idempotent processing, and retention               |
| `packages/sdk`       | Browser and Node tracking client                          |
| `examples/demo`      | GalaxyBalls synthetic event demo                          |
| `scripts/verify.mjs` | Shared local and CI verification sequence                 |

Read the [phase plan](docs/plan.md), [architecture](docs/architecture.md),
[event semantics and operations](docs/events.md), [analytics counting rules](docs/analytics.md),
[conversion path rules](docs/conversion-paths.md),
[self-hosting guide](docs/self-hosting.md),
[contribution rules](CONTRIBUTING.md), and [security notes](SECURITY.md).

## License

[MIT](LICENSE), copyright 2026 Natnael Mekuriaw.
