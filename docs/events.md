# Event collection and operations

## HTTP contract

POST JSON to `/api/v1/ingest`:

```json
{
  "projectKey": "el_pk_your_public_project_key",
  "events": [
    {
      "eventId": "3b9d63d1-e752-4d8e-849c-cc9a3c0f7c53",
      "type": "track",
      "name": "level_completed",
      "occurredAt": "2026-10-22T12:00:00.000Z",
      "anonymousId": "synthetic-session-42",
      "properties": { "level": 1 }
    }
  ]
}
```

Use a current occurrence time when trying this example. Optional userId links an
explicit external user. Identify records require type/name `identify` and userId.
Unknown envelope/event fields are rejected. The route allows credential-free
CORS with Content-Type; it does not use session cookies.

| Bound                 | Rule                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------- |
| Batch                 | 1–50 events; at most 262,144 UTF-8 JSON bytes                                           |
| Properties            | JSON object; at most 8,192 UTF-8 JSON bytes                                             |
| Nesting               | Maximum validated depth 5; at most 100 keys/items per container                         |
| Property keys/strings | Keys 1–100 characters; strings at most 4,096 characters                                 |
| Property values       | Finite numbers, strings, booleans, null, arrays, plain objects                          |
| Unsafe keys           | `__proto__`, `constructor`, and `prototype` are rejected                                |
| Event name            | 1–100 characters, starts with a letter; letters, digits, underscore, dot, space, hyphen |
| Actor IDs             | 1–200 characters, no surrounding whitespace or control characters                       |
| Occurrence time       | ISO timestamp with offset; at most 30 days late or 5 minutes ahead                      |

The API validates all events before insertion; an invalid batch accepts none.
It returns 202 with accepted/duplicates counts and server receivedAt only after
new receipts and outbox work commit to PostgreSQL. Duplicate-only valid batches
also return 202. Redis availability does not affect this commit boundary.
202 does not mean processing has finished.

Duplicate identity is `(projectId, eventId)`. Retries must preserve event IDs.
Within one batch, repeated IDs are collapsed; across requests the first committed
receipt wins. A repeated ID is not an update. Dedupe tombstones remain after event
retention, so a later retry cannot recreate expired analytics data.

Malformed requests return 400, invalid keys 401, oversized bodies 413, non-JSON
requests 415, and admission limits 429. Key rotation immediately rejects new
requests using the old key; previously accepted receipts continue processing.

## Processing and recovery

The worker checks the PostgreSQL outbox every second in pages of 100. Queue jobs
contain receipt ID and replay generation, without event properties or actor IDs.
Pending rows are eligible for redispatch after 30 seconds, including after Redis
loss. Multiple deliveries are safe: processing locks the receipt and atomically
writes the event, handles identity, marks it processed, clears the receipt payload,
and removes outbox work.

BullMQ uses concurrency 8, five attempts with exponential backoff starting at one
second, and bounded completed/failed job history. A stale replay generation does
nothing. Pending receipt payloads are not removed by cleanup.

The explorer shows pending, processed, failed, and expired receipt counts.
Owners/admins can list failed receipt metadata and replay a failure while its
payload is retained. Replay resets attempts and creates a new generation. It
preserves the event ID and cannot duplicate an existing analytics event. Error
codes are generic; inspect process health and database connectivity before replay.

If pending counts grow:

1. Check PostgreSQL and Redis health, API readiness, and worker readiness.
2. Check worker logs for generic queue/dispatch/processing error codes.
3. Restore dependencies and allow outbox redispatch to resume.
4. Review terminal failures and replay retained receipts after correcting the cause.

Worker liveness is `http://127.0.0.1:3002/health/live`; readiness is
`/health/ready`. Readiness checks database/queue access and rejects a dispatcher
that has not completed a successful pass in the previous minute. It is not proof
of low event latency or a zero failure backlog. Monitor the receipt counts.

## Identity

Identity links use `(projectId, anonymousId)`. The first processed association
with a user ID wins. Processing order can differ from occurrence order. Another
user claiming that anonymous ID does not replace the link; the individual event
keeps its supplied userId and is marked identityConflict.

Anonymous historical events retain userId null; Phase 2 does not rewrite them or
merge profiles across projects. Identity is supplied analytics context and never
authenticates a dashboard user. SDK reset and user switching create fresh
anonymous IDs to avoid carrying one visitor's association into another session.

## Explorer

Members can list/inspect events only in an authorized workspace/project.
The list sorts by occurrence time descending, then record ID descending, and
supports cursor pagination. Event-name and actor filters are exact matches; actor
matches either explicit userId or anonymousId. UTC time bounds are inclusive.
The dashboard displays timestamps in the project timezone while its filter
inputs use UTC. Live mode polls the first page every five seconds.

Processing status is asynchronous. An empty explorer can mean filters match
nothing or accepted receipts are still pending. Phase 2 supplies raw events;
aggregate trends, funnels, cohorts, exports, and property-query filters follow
later.

## Retention

`EVENT_RETENTION_DAYS` defaults to 90 and accepts 7–3650. Cleanup runs once per
minute in bounded pages of 1,000. It deletes analytics events by server receivedAt,
so late occurrence times do not shorten their retention window. Large backlogs
take multiple cleanup passes.

Failed payloads expire after 14 days from failedAt and become expired receipts;
they cannot be replayed afterward. Old identity links are removed only when they
have no remaining analytics events. Receipt tombstones retain minimal delivery
metadata indefinitely for deduplication. Event retention is not complete actor
erasure; there is no automated user erasure workflow in Phase 2. Include receipts,
database backups, and deployment logs in your data retention policy.

## Limits and measurements

Admission limits are process-local: 3,000 event submissions per project/minute
and the API's socket-based mutation request limit. Duplicate submissions count
toward admission. Proxies can group callers under one socket source. Use one API
instance and configure proxy limits; replicated ingestion requires shared
admission control before deployment.

The SDK buffer is memory-only, and public keys can be copied and abused to submit
synthetic events. The source deployment has no automatic event authenticity,
high-availability claim, partitioned storage, or measured capacity guarantee.

The ingestion benchmark uses synthetic bounded batches against an explicit
`BENCHMARK_API_URL` and `BENCHMARK_PROJECT_KEY`. Use a disposable project, keep
credentials outside shell history where possible, and run the shared verification
entry point for its isolated workload. HTTP acceptance latency measures the
PostgreSQL acknowledgement path; it does not measure eventual processing latency.
No benchmark figures are claimed before executing the workload.
