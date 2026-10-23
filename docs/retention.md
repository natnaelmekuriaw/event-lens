# Daily retention

Retention measures return on a specific project-local calendar day, rather than
return on or after that day. All dates use the project's reporting timezone.
The cohort range is `[from, to)` in calendar dates, at most 90 days, with 1–30
return days. Day boundaries follow the timezone, including daylight saving changes.

Each canonical actor enters once, on their first matching retained entry event
inside the selected range. This is a range cohort, not a claim about their first
ever use of the product. Changing the range can change their cohort date.
Only processed `track` events count. Identity links and conflicts follow the
same rules as the analytics overview.

Day zero is the baseline: every entrant counts, independently of the return
event. On day N (N >= 1), an entrant counts once if they perform the selected
return event on that exact local date. Repeated returns do not increase the count.
Returns may occur after the cohort range ends. Entry and return property filters
independently match one exact top-level scalar value as text.

The denominator is the original cohort size. Empty completed cohorts show zero
people and zero rates. The current local day and future days are incomplete and
return null counts and rates, displayed as unavailable. Even day zero is
unavailable until its calendar day ends. Cohort sizes for open days are provisional.

Results reflect retained data at query time. Late arrivals, identity links, and
storage cleanup can change historical values. Storage retention is based on
receipt time, so missing historical events cannot be reconstructed. A zero is
not evidence of complete historical collection. Use ranges covered by your
installation's retained history.

All workspace members may read retention for their projects. Public ingestion
keys grant no read access. No saved retention definitions or new database tables
are required in this phase.

## API and dashboard

Open the project's Analytics page and follow Retention. The form selects entry
and return events, their optional scalar property filters, a cohort range, and
the number of return days. Dates refer to the project timezone; Before is exclusive.
The heatmap includes exact values and text labels, so color is optional for reading it.

`GET /api/v1/workspaces/:workspaceId/projects/:projectId/retention` accepts
`from` and `to` as `YYYY-MM-DD`, `entryEvent`, `returnEvent`, and `days` (default 7).
Optional `entryPropertyKey`/`entryPropertyValue` and
`returnPropertyKey`/`returnPropertyValue` must be paired; an empty value can match
an empty string. Unknown fields and invalid dates are rejected.

The response contains timezone, asOf, selected events, days, and daily cohorts.
Each cohort includes date, size, and cells with day, users, and rate (fraction).
Unavailable cells have null users and rate. Counts use a single database snapshot.
No return after the requested horizon contributes to the report.

`pnpm verify` includes unit cases, the hand-counted integration dataset, a browser
journey, and a benchmark saved to `.tmp/benchmark-retention.json`. The benchmark
uses 1,000 events and 100 actors, two warmups, and 20 measured requests. It records
latency percentiles; this small dataset does not establish production capacity.
