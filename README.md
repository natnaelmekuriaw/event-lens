# EventLens

EventLens is a self-hosted product analytics platform for understanding what users
do, which features they use, and where they drop off.

Phase 1 provides the account and project foundation: a Next.js dashboard, a NestJS
API, PostgreSQL, and shared TypeScript packages. Event ingestion, the SDK,
analytics, funnels, and retention are planned in later phases.

## Phase 1 features

- Protected first-owner setup, email/password sign-in, sign-out, and password changes.
- Workspaces with owner, admin, and viewer roles.
- Projects with editable names and IANA reporting timezones.
- Public project key creation and rotation; the full key is shown once.
- Invitations with a 48-hour lifetime, revocation, and acceptance for new or existing accounts.
- Database migrations, health endpoints, CI, and one verification command.

Public signup is disabled. Owners share invitation links privately; EventLens does
not send invitation email in this phase. Public project keys cannot read or manage
workspace data. Event ingestion is not implemented yet.

## Local development

Use a supported Node.js version from `package.json`, the pinned pnpm version, and
Docker Compose v2. Run these commands from the repository root:

```sh
pnpm install
pnpm setup
docker compose up -d --wait postgres
pnpm db:generate
pnpm db:migrate
pnpm --filter @eventlens/contracts build
pnpm --filter @eventlens/database build
pnpm dev
```

`pnpm setup` creates a local `.env` with random secrets and keeps an existing file.
Open [owner setup](http://localhost:3000/setup), read `BOOTSTRAP_TOKEN` from your
local `.env`, and create the first owner and workspace. Then sign in and create a
project. Setup closes after successful initialization.

The API runs on port 3001. The dashboard proxies browser requests through its own
`/api` path. Local documentation is available at
[API docs](http://localhost:3000/api/docs).

Docker Compose currently runs PostgreSQL only. Application processes run through
pnpm. The API development command and Next.js configuration load the root `.env`.
Next.js uses `API_URL` for its proxy and defaults to `http://localhost:3001`.
Rebuild the dashboard after changing the proxy destination.

## Verification

The complete verification entry point is:

```sh
pnpm verify
```

It runs setup, infrastructure readiness, database preparation, checks, tests, and
application builds in order, reports progress, and stops on failure. It requires
Docker and access to the package registry and browser downloads. The repository
owner runs Docker, database operations, and the final test suite. Focused offline
checks can be run during implementation.

No analytics benchmark results are available in Phase 1; benchmarks belong to the
later event and analytics phases.

## Repository guide

| Path                 | Responsibility                                                 |
| -------------------- | -------------------------------------------------------------- |
| `apps/web`           | Next.js dashboard and same-origin API proxy                    |
| `apps/api`           | NestJS API, sessions, access control, workspaces, and projects |
| `packages/contracts` | Request validation and shared response types                   |
| `packages/database`  | Prisma schema, migrations, and PostgreSQL client               |
| `scripts/verify.mjs` | Shared local and CI verification sequence                      |
| `docs`               | Architecture, decisions, deployment guidance, and phase plan   |

Read the [phase plan](docs/plan.md), [architecture](docs/architecture.md),
[self-hosting guide](docs/self-hosting.md), [contribution rules](CONTRIBUTING.md),
and [security notes](SECURITY.md).

## License

[MIT](LICENSE), copyright 2026 Natnael Mekuriaw.
