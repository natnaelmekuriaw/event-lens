# Implementation plan

EventLens is a self-hosted product analytics platform written in strict TypeScript.
Each phase is agreed before implementation; later phases remain proposals.

| Phase | Branch               | Outcome                                                                                        | Estimated commits |
| ----- | -------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| 1     | `feat/project-setup` | Accounts, workspaces, roles, projects, runnable dashboard, database, Compose, CI, verification | 20–32             |
| 2     | `feat/events`        | SDK-to-dashboard event pipeline, identity, durable ingestion, workers, demo                    | 30–44             |
| 3     | `feat/analytics`     | Trends, active users, filters, timezones, activity timelines                                   | 20–32             |
| 4     | `feat/funnels`       | Ordered funnels with documented and tested counting rules                                      | 16–24             |
| 5     | `feat/retention`     | Daily cohorts, return events, observation windows                                              | 16–24             |
| 6     | `feat/release`       | Recovery, measured performance, backup/restore, release polish                                 | 20–32             |

Phase 1 is authorized. Commit estimates are flexible: each commit represents a
coherent change, and scope/count mismatches are reported rather than filled with churn.

## Phase 1 acceptance

- An operator creates the first owner through a one-time protected setup flow.
- The owner signs in, creates workspaces and projects, manages roles, and rotates
  public project keys. Public keys never authenticate management requests.
- New accounts require an invitation; public signup stays disabled.
- Every project operation checks workspace membership.
- A single verification command installs dependencies, starts infrastructure,
  applies migrations, runs checks and tests, and builds the applications.
- CI and local checks use the same verification script.

Analytics, SDK ingestion, background jobs, and analytics benchmarks start in Phase 2.
