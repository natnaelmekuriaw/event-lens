# Release readiness audit

Audited baseline: `d0066d1` on `origin/main`, including Phase 5. Branch:
`feat/release`. The owner reported Phase 5 full verification passed.

The original audit reviewed repository source, tests, configuration, and operating
guides. The findings below describe that baseline, with historical line references;
they are not claims about the current implementation. The owner subsequently
authorized combining all remaining stages on this branch. Deployment, restore,
failure injection, and capacity acceptance still require the owner's full run.
No penetration test has been performed.

## Combined implementation status

| Gate | Implemented                                                                                                                                                    | Acceptance still requiring owner execution                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| R1   | Generated Compose project, credentials, databases and volumes; private recovery file; no application `.env` loading; explicit external deployment volumes      | Successful and interrupted disposable runs; inspect existing volume selection before deployment               |
| R2   | Repeatable-read conversion scan and multi-page identity regression fixture                                                                                     | Execute database regression                                                                                   |
| R3   | Hidden interactive recovery input, maintained credential hash, session revocation, membership preservation                                                     | Execute integration and restored-account acceptance                                                           |
| R4   | Fresh dump/restore, table manifest, restored auth invalidation and read/duplicate checks; Phase 2 schema upgrade and transactional DDL failure probe           | Execute rehearsal and inspect revision/duration artifact; arbitrary nontransactional rollback is not provided |
| R5   | Shutdown deadline and finally-based cleanup; forced worker kill at a lock checkpoint, Redis outage/state erasure, restart/drain rehearsal; process-tree runner | Execute deployed failure tests and interruption checks on supported Windows/Linux hosts                       |
| R6   | Four report slots, database/application deadlines, timeout responses, combined browser cancellation/timeout                                                    | Execute slow-statement regression; focused browser-helper unit checks cover both signals                      |
| R7   | Non-root application image targets, migration ordering, private listeners, immutable image references, Caddy HTTPS and acceptance flow                         | Build and execute actual Compose configuration                                                                |
| R8   | 100k-event historical fixture, concurrent reports, cleanup catch-up, sustained HTTPS ingestion, backlog age metrics, revision/host metadata                    | Run and review measurements before publishing capacity limits                                                 |
| R9   | Updated feature/security docs, deployment/recovery/performance guides, screenshot generation and CI artifact retention, pinned actions, dependency updates     | Review generated screenshots/artifacts and choose release tag after verification                              |

Checklist items below remain release gates until runtime evidence is reviewed.
See [deployment and recovery](release-operations.md) and
[performance qualification](performance.md) for the implemented procedure and its
limits. A clean dependency scan is advisory evidence, not a security audit.

### Focused checks on 2026-10-24

- Formatting, lint, workspace TypeScript, and API/worker/dashboard/demo builds passed.
- All 60 unit tests in 13 files passed, including timeout/cancellation, report-slot
  release, and process-runner interruption/cleanup behavior.
- The new database regression fixture type-checks; script syntax and browser test
  discovery passed. Discovery is not database or browser execution.
- `pnpm audit --audit-level high` returned no known vulnerabilities after updating
  demo Vite to 8.1.6, body-parser to 2.4.0, and Multer to 2.5.0. Narrow workspace
  overrides cover upstream Nest/Express pins until their dependencies are updated.
  See the upstream [body-parser advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828)
  and [Multer advisory](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m).
- Docker operations, migrations, integration/browser execution, restore/upgrade
  rehearsals, interruption checks against live services, and benchmarks were not run.

The owner runs `pnpm verify` and reviews the resulting evidence before declaring
these runtime gates closed. Push and release publication remain pending.

## Existing foundations

- PostgreSQL receipts and outbox commit before ingestion acknowledgement.
  Processing locks receipts, checks generation/status, writes events and identities,
  and clears outbox work transactionally. Project/event uniqueness provides durable
  duplicate protection. See [processor](../packages/pipeline/src/processor.ts).
- Workspace membership and role checks, trusted mutation origins, disabled public
  signup, hashed ingestion keys, bounded ingestion payloads, and logging that omits
  request bodies/query strings are implemented. Relevant evidence:
  [access checks](../apps/api/src/workspaces/access.service.ts),
  [origin guard](../apps/api/src/auth/origin.guard.ts),
  [auth](../apps/api/src/auth/auth.service.ts), and [logger](../apps/api/src/logger.ts).
- Integration coverage includes lost queue-job reconstruction, replay generations,
  duplicate delivery, identity conflicts, tenant boundaries, and real worker
  processing. It is not a process-crash or full Redis-loss rehearsal.
  See [pipeline cases](../tests/integration/pipeline-cases.ts).
- The shared verification entry point, isolated test database/queue cleanup, and
  CI benchmark artifacts exist. The findings below qualify what these establish.

## Prioritized release gates

Priority 1 items should close before recommending the installation for retained
user data. Priority 2 items should close before declaring the supported deployment
and workload. These priorities describe release requirements, not vulnerability scores.

### R1 — Priority 1: isolate verification and protect deployment storage

**Confirmed behavior:** [verify.mjs](../scripts/verify.mjs#L105) migrates the
configured application database before creating the isolated database at line 135.
The isolated test cleanup does not undo that migration. The guide warns against
production use, but the script has no equivalent target-isolation preflight.

[compose.yaml](../compose.yaml#L33) also gives PostgreSQL and Redis fixed global
volume names. Changing only the Compose project name does not give a second
installation different named volumes. An upgrade must account for existing volume
names and labels rather than silently attach a new empty database.

- [ ] Make runtime verification use explicitly disposable infrastructure/state;
      application database migration belongs to an explicit operator deployment step.
- [ ] Reject unsupported verification targets before starting services or migrating.
- [ ] Give independent installations independent storage while preserving an
      explicit, documented upgrade path for existing volumes.
- [ ] Verify that a sentinel application database and its records remain unchanged
      across successful, failing, and interrupted verification runs.

### R2 — Priority 1: keep conversion-path identity consistent across pages

**Code-backed risk; not reproduced in this audit:** the
[runner](../apps/api/src/funnels/runner.ts#L25) issues a separate query for each
page and joins current identity links. Its processing-time cutoff does not freeze
identity associations. A link committed between pages can change the same person's
actor key between their entry and later step, causing inconsistent conversion counts.
The API currently has no enclosing snapshot transaction for this scan.

- [ ] Evaluate a report against one consistent identity/event snapshot, with an
      explicit execution budget.
- [ ] Add a regression fixture exceeding one page that commits an identity link
      between page reads; verify the response remains internally consistent.
- [ ] Preserve ordering, window boundaries, tenant scope, and actor limits.

### R3 — Priority 1: provide operator account recovery

**Missing deliverable:** [SECURITY.md](../SECURITY.md#L28) explicitly states that
password recovery and an operator recovery procedure are absent. Auth supports
signed-in password changes, but a sole owner who loses their password cannot use
that flow. Bootstrap remains closed after initialization.

- [ ] Provide a privileged operator recovery path for an existing account using
      the maintained auth password format and private password input.
- [ ] Revoke the recovered account's sessions and test the old/new credentials.
- [ ] Preserve workspace memberships, last-owner rules, and disabled public signup.
- [ ] Document the operator authority required and keep credentials out of logs,
      process arguments, and committed files.

### R4 — Priority 1: demonstrate backup, restore, and upgrade recovery

**Missing evidence:** [self-hosting](self-hosting.md#L111) documents logical dump
and restore commands and a fresh queue namespace, but explicitly leaves rehearsal
outside verification. There is no automated isolated restore acceptance case.

- [ ] Back up a disposable installation containing accounts, definitions, processed
      events, duplicate receipts, and pending outbox work; restore to a fresh target.
- [ ] Check sign-in, tenant isolation, analytics, conversion paths, retention,
      pending-work completion, and duplicate protection after restoration.
- [ ] Define and test invalidation of restored sessions and outstanding invitation
      tokens before reopening traffic; restoration can reintroduce old database state.
- [ ] Exercise supported schema upgrades and recovery from a failed upgrade.
      Document compatible application/database versions and an operator stop condition.
- [ ] Record the executed revision and restore duration. Keep backup files private
      and enforce explicit disposable-target checks for destructive rehearsal steps.

### R5 — Priority 2: qualify process shutdown and dependency recovery

**Evidence gap:** API and worker enable shutdown hooks. The worker
[shutdown path](../apps/worker/src/runtime.ts#L130) awaits dispatch, active jobs,
queue closure, and database disconnection without an application shutdown deadline.
The integration journey calls these methods inside its test process; it does not
terminate and restart deployed child processes during active work.

- [ ] Test SIGTERM during ingestion/processing and abrupt worker termination after
      acknowledgement, then restart and verify no lost receipts or duplicate counts.
- [ ] Exercise actual dependency outages/reconnections in disposable infrastructure;
      deleting one queue job is narrower evidence than losing Redis state.
- [ ] Define readiness transitions, shutdown ordering, supervisor grace period,
      and the policy when a shutdown budget expires.
- [ ] Interrupt verification and confirm all spawned application processes stop
      before isolated database/queue cleanup; check Windows and Linux behavior.

### R6 — Priority 2: bound analytics requests and preserve client timeouts

**Confirmed client issue:** [api.ts](../apps/web/src/lib/api.ts#L22) chooses the
caller signal instead of its default 15-second timeout.
[useResource](../apps/web/src/lib/use-resource.ts#L18) always supplies a signal,
so resource reads have no elapsed-time limit from that helper.

**Server availability gap:** retention runs a raw aggregation without an explicit
statement deadline; conversion paths page without a total scan deadline. Date,
page, and actor limits do not cap all matching events or query execution time.
The overview has a transaction timeout, but there is no shared read-query budget.

- [ ] Combine timeout and cancellation signals so both remain effective.
- [ ] Add coherent database/report deadlines, useful timeout responses, and
      bounded read admission appropriate to the supported single-API topology.
- [ ] Verify slow-query cancellation and that a later ordinary request succeeds.
- [ ] Keep socket-based admission behavior documented behind the actual proxy;
      do not trust arbitrary forwarded headers to identify clients.

### R7 — Priority 2: ship and exercise the supported deployment

**Missing deliverable:** [Compose](../compose.yaml) contains infrastructure only;
there are no application Dockerfiles. The
[source deployment guide](self-hosting.md#L3) acknowledges this limitation.

- [ ] Package API, worker, and dashboard with pinned runtime/dependency inputs,
      non-root execution, explicit health checks, and documented persistent storage.
- [ ] Define migration ordering, secrets delivery, reverse-proxy/TLS boundaries,
      and the build-time dashboard API destination.
- [ ] Exercise the real production configuration: secure sessions, sign-in,
      trusted-origin mutations, SDK ingestion, health, restart, and upgrades.
- [ ] Keep database, Redis, API management listener, and worker health private
      according to the documented topology. Publish only intended entry points.

### R8 — Priority 2: establish workload and maintenance limits

**Evidence limit:** current analytics benchmarks use 1,000 events and 100 actors
with 20 sequential measured reads. Ingestion events share one occurrence timestamp;
the retention workload is concentrated on one entry day. These smoke measurements
do not qualify long date ranges, concurrency, or sustained end-to-end throughput.
See [benchmark source](../scripts/benchmark-ingestion.mjs#L47) and
[query measurements](../tests/e2e/events.spec.ts#L272).

The [dispatcher](../packages/pipeline/src/dispatcher.ts#L15) takes at most 100
outbox rows per tick. [Cleanup](../packages/pipeline/src/retention.ts#L20) takes
at most 1,000 expired events per pass, scheduled roughly once a minute by the
worker. These are configured work budgets, not measured throughput. Expiry and
outbox backlogs need qualification under sustained load.

- [ ] Measure ingestion-to-visible latency, sustained processing, and concurrent
      overview/conversion/retention reads over representative historical data.
- [ ] Include source revision, dataset distribution, hardware/topology, concurrency,
      warmup, sample count, and p50/p95/p99 with each retained report.
- [ ] Measure cleanup catch-up and oldest pending/expired age; adjust bounded work
      budgets only from evidence, preserving foreground responsiveness.
- [ ] Define a modest supported workload and documented operating limits from
      actual results. Larger infrastructure remains separate scope.

### R9 — Priority 2: finish release documentation and evidence

- [ ] Update the stale Phase 1/2 feature description in SECURITY.md and remove
      resolved limitations only after their acceptance evidence exists.
- [ ] Complete a clean-install quickstart, upgrade/recovery runbook, troubleshooting,
      and synthetic dashboard screenshots for the features now implemented.
- [ ] Review dependencies and CI action references against current advisories;
      record what was checked without equating a clean scan with a security audit.
- [ ] Retain revision-linked verification/benchmark/recovery artifacts and decide
      the release version/tag once all agreed gates pass. Publishing and pushing
      remain operator actions.

## Original implementation breakdown

The owner authorized merging the following rows into one stage on `feat/release`.
The original estimates total 18–30 commits; the combined implementation needs
about 9 coherent commits, with no churn to reach the original number.

| Stage | Scope                                                      | Expected outcome                                                                                 | Approximate commits |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| 6B    | R1: verification target and volume safety                  | Disposable verification with an unchanged application database and explicit storage upgrade path | 3–5                 |
| 6C    | R2 and R6: report consistency and request budgets          | Stable conversion counts and bounded, cancellable reads                                          | 3–5                 |
| 6D    | R3–R5: account recovery, restore, process failure/shutdown | Rehearsed recovery with documented operator steps and no lost acknowledged work                  | 5–8                 |
| 6E    | R7: application packaging and production topology          | A reproducible supported self-hosted deployment                                                  | 4–7                 |
| 6F    | R8–R9: workload qualification and release evidence         | Measured limits, current guides, and a reviewable release candidate                              | 3–5                 |

For each accepted stage, extend the single `scripts/verify.mjs` flow with applicable
ordered checks. The owner runs Docker, database operations, the full final suite,
benchmarks, and git push. Focused offline checks may run during implementation.

The audit was accepted as a source review. Combined implementation acceptance now
uses the complete verification script; the earlier Phase 5 pass does not qualify
the new release packaging or rehearsals.
