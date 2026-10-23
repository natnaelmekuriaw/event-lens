# Analytics counting rules

Phase 3 reports processed events from PostgreSQL. All endpoints require a signed-in workspace member and verify that the project belongs to that workspace. Public ingestion keys cannot read analytics.

- Only `track` events count in trends, active users, and top events. Identify events remain visible in the raw event explorer and activity timeline.
- The range is `[from, to)` in UTC instants, at most 366 days. Event occurrence time selects the range. The current response reflects processed, retained events; pending receipts and expired data are excluded.
- Day, ISO week (Monday start), and month buckets use the project's IANA timezone. Bucket dates are local calendar dates. Empty buckets are returned as zero. A changed project timezone changes the displayed grouping, not stored timestamps.
- An active user is one distinct canonical actor with a `track` event in the range or bucket. If an anonymous ID has an identity link, its prior and later events count under that linked user. An event flagged as an identity conflict counts under its explicitly supplied user ID. Otherwise an unlinked anonymous ID counts independently. User and anonymous IDs have separate namespaces. Total active users is deduplicated across the whole range and need not equal the sum of bucket counts. A new identity link can change historical distinct-user counts.
- Event name filters use exact names. Property filters compare one top-level scalar value as text, using a parameterized key and value. Missing, object, array, and null properties do not match. Filters apply before counts and distinct actors are calculated.
- Top events are the ten most frequent matching `track` names in the selected range, ordered by count then name. Activity timelines use the same range and filters, sorted by occurrence time then event ID, newest first; a user timeline includes linked anonymous history and excludes conflicting activity for another user.

These rules define overview and activity counting. Ordered conversion paths
have [their own counting rules](conversion-paths.md), as does [daily retention](retention.md).

## API and dashboard

The project overview is at `/workspaces/:workspaceId/projects/:projectId/analytics`. It includes event totals, active users, a chart with an exact-value table, top event names, and an activity search. The UI selects inclusive UTC calendar dates and sends an exclusive UTC `to` instant to the API.

Authenticated GET endpoints:

- `/api/v1/workspaces/:workspaceId/projects/:projectId/analytics/overview?from=...&to=...&bucket=day`
- `/api/v1/workspaces/:workspaceId/projects/:projectId/analytics/activity?from=...&to=...&actorType=user&actorId=...`

`bucket` is `day`, `week`, or `month`. Optional `name` is exact. `propertyKey` and `propertyValue` must be sent together. Activity additionally accepts `limit` (1–100) and an opaque event `cursor`. The server rejects unknown query fields, invalid ranges, and dates more than 366 days apart. A signed-in viewer may read analytics; an ingestion key alone cannot.

The overview returns `totalEvents`, `activeUsers`, `series`, and `topEvents`. Activity returns `items` and `nextCursor`. Empty buckets have zero counts. Empty activity pages have no items. The overview is a live query over processed events, so results can change as pending receipts complete or retention removes old data.
