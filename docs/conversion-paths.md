# Conversion path counting rules

A conversion path measures how many actors complete an ordered sequence of 2–6 `track` events. A saved definition has a name, event steps with optional exact top-level scalar property filters, and one elapsed conversion window of 1 minute to 30 days.

- The reporting range is `[from, to)` by event occurrence time, supplied as UTC instants and limited to 90 days. Only the **first matching step-one event** for each canonical actor in this range starts an attempt. Later step-one events do not restart it.
- Each later step is the earliest matching event after the previous matched event. Events sort by `(occurredAt, eventId)`; equal timestamps can advance the path only when the later step's event ID sorts after the earlier event's ID. A single event can satisfy only one step, even when names repeat.
- Every later step must occur no later than `entry time + window`. The boundary is inclusive. Later steps may fall outside the entry range, up to that deadline. A late event beyond the deadline never converts that attempt.
- Actors use the same identity rule as [analytics](analytics.md): a linked anonymous ID resolves to its identified user; a conflicting event follows its explicitly supplied user; otherwise unlinked anonymous IDs remain separate. Linking can change historical counts.
- Counts represent distinct actors who reached each step, once per path. The first-step count is the denominator. Each step reports exact users, dropoff from the prior step, conversion from entry, and conversion from the prior step. Empty paths return zero rates.
- Property filters use exact top-level string, number, or boolean text; missing, null, array, and object values never match. Names and properties are untrusted input and are bounded by the API schema.
- Results are a live snapshot of processed, retained events. Recent entries may still convert before their window expires, so their counts are provisional. Retention and newly linked identities may also change historical results.

Definitions belong to one project. Owners and admins may create, edit, or delete them; any workspace member may list definitions and view results. Public project keys cannot read or manage paths. The API limits each result to 100,000 entrants; narrow the date range when a project exceeds this bound.
