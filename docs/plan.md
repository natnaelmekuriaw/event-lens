# Implementation plan

EventLens is a self-hosted product analytics platform written in strict TypeScript.
Each phase is agreed before implementation; later phases remain proposals.

| Phase | Branch                  | Outcome                                                                               | Estimated commits |
| ----- | ----------------------- | ------------------------------------------------------------------------------------- | ----------------- |
| 1     | `feat/project-setup`    | Accounts, workspaces, roles, projects, dashboard, database, Compose, CI, verification | 20–32             |
| 2     | `feat/events`           | SDK-to-dashboard pipeline, identity, durable ingestion, workers, demo                 | 30–44             |
| 3     | `feat/analytics`        | Trends, active users, filters, timezones, activity timelines                          | 40–55             |
| 4     | `feat/conversion-paths` | Ordered conversion paths, saved definitions, builder, and results                     | 32–45             |
| 5     | `feat/retention`        | Daily cohorts, return events, observation windows                                     | 32–48             |
| 6     | `feat/release`          | Recovery, measured performance, backup/restore, release polish                        | 20–32             |

Phases 1–5 are authorized. The owner confirmed Phase 4 verification and CI passed.
Phase 5 proceeds on `feat/retention`; Phase 6 remains a proposal.
Commit estimates are flexible: each commit represents a coherent
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

## Phase 4 acceptance

- Owners and admins can save, edit, and delete project-specific conversion paths with 2–6 ordered event steps, optional scalar property filters, and a bounded window.
- The result uses the first qualifying entry per actor, strict `(occurredAt, eventId)` step order, and allows later steps outside the entry range when within the window.
- Linked identities and conflicts follow the analytics actor rules, and counts, dropoff, and rates come from processed events.
- Members can inspect definitions and results for their own projects, while public ingestion keys grant no read access.
- The dashboard provides an accessible builder and results view. Isolated integration and browser checks cover rules, authorization, and measurement.

## Phase 5 acceptance

- Daily cohorts use each actor's first qualifying retained entry within the selected project-local date range. Day zero is the cohort baseline.
- Exact-day return counts use the same canonical identities as analytics; duplicate returns count once and do not move the entry date.
- Entry and return scalar property filters apply independently. Ranges are at most 90 calendar days, with 1–30 return days.
- Current and future observation days return null counts and rates. Empty completed cohorts return zeros. The dashboard explains these distinctions and retained-history limits.
- Every read requires project membership. Ingestion keys cannot read retention.
- Hand-counted integration fixtures cover identity conflicts, timezone/DST, filters, and tenant isolation. Browser coverage and a representative benchmark join the single verification script.

Approved stages on `feat/retention`: 5A rules and fixtures (6–10 commits),
5B API (10–14), 5C dashboard (8–12), and 5D verification/docs (8–12).
The implementation is smaller than this estimate; actual commits will follow
coherent changes rather than the numerical target.
