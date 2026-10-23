# Implementation plan

EventLens is a self-hosted product analytics platform written in strict TypeScript.
Each phase is agreed before implementation; later phases remain proposals.

| Phase | Branch               | Outcome                                                                               | Estimated commits |
| ----- | -------------------- | ------------------------------------------------------------------------------------- | ----------------- |
| 1     | `feat/project-setup` | Accounts, workspaces, roles, projects, dashboard, database, Compose, CI, verification | 20–32             |
| 2     | `feat/events`        | SDK-to-dashboard pipeline, identity, durable ingestion, workers, demo                 | 30–44             |
| 3     | `feat/analytics`     | Trends, active users, filters, timezones, activity timelines                          | 40–55             |
| 4     | `feat/funnels`       | Ordered funnels with documented and tested counting rules                             | 16–24             |
| 5     | `feat/retention`     | Daily cohorts, return events, observation windows                                     | 16–24             |
| 6     | `feat/release`       | Recovery, measured performance, backup/restore, release polish                        | 20–32             |

Phases 1, 2, and 3 are authorized. Phase 1 verification passed. Phase 2 implements the
agreed scope on `feat/events`; full runtime verification and benchmark measurements
must run against its completed revision before publishing. Phase 3 adds trends,
active users, filtered activity, and project-local reporting. Phases 4–6 remain
proposals. Commit estimates are flexible: each commit represents a coherent
change, and scope/count mismatches are reported rather than filled with churn.

## Phase 1 acceptance

- Protected one-time first-owner creation and session authentication.
- Workspace roles, project management, key rotation, and private invitations.
- Every management operation checks workspace membership.
- Shared local/CI verification with setup, migrations, tests, and builds.

## Phase 2 acceptance

- Browser and Node SDKs track named events and identify users with isolated context.
- Ingestion validates the entire batch, timestamps, payload bounds, public keys,
  and rate limits before acknowledging new receipts.
- HTTP 202 follows a PostgreSQL transaction containing receipts and outbox work.
  Redis or worker interruption does not remove acknowledged pending events.
- Worker processing is idempotent by project/event ID; retries, failure state,
  replay, identity conflicts, and retention have explicit rules.
- Members can inspect only their project's events; owners/admins can replay retained
  failures. Public project keys grant no read access.
- The demo sends synthetic gameplay events that appear in the explorer.
- The verification script includes appropriate pipeline checks and an ingestion
  benchmark, with measured results produced by execution.

Phase 2 contains raw event inspection. Aggregate trends, funnels, and cohort
retention belong to later phases. Event storage retention is already necessary
for operating this pipeline and is separate from cohort retention analysis.

## Phase 3 acceptance

- Project members can see real event totals, distinct active users, trend buckets, and top event names for a bounded date range.
- Filters for exact event names and top-level scalar properties apply consistently to counts and activity.
- Reporting uses the project timezone for daily, Monday-start weekly, and monthly buckets, including empty periods and daylight saving transitions.
- Linked anonymous events count under their identified user; conflicts stay with the explicitly supplied user. The rules are documented in [analytics.md](analytics.md).
- Members can inspect a paginated user or anonymous activity timeline without crossing project boundaries. Public ingestion keys grant no read access.
- Isolated integration and browser journeys cover counting, identity, filters, timezone boundaries, and authorization. The verification script records ingestion and analytics benchmarks.
