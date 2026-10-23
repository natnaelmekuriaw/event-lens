# Event delivery and identity

Phase 2 uses PostgreSQL receipts and a transactional outbox. HTTP 202 means every
new event and its outbox row committed to PostgreSQL. It does not mean analytics
processing finished. Redis availability is outside this acknowledgement boundary.

The dispatcher rechecks outstanding outbox rows. BullMQ jobs contain receipt IDs,
not properties or identities. Processing inserts an event, associates identity,
marks its receipt processed, and removes outbox work in one transaction.
Delivery is at least once; project-scoped event IDs make database effects
idempotent. Receipt tombstones survive analytics retention.

Batches contain at most 50 events and 256 KiB of JSON. Properties are bounded to
8 KiB, depth 5, and 100 keys/items per container. Invalid batches are rejected
entirely. Occurrence timestamps allow 30 days of lateness and 5 minutes of clock
skew into the future. Receipt time is always assigned by the server.

Anonymous identifiers can associate with one external user per project.
Conflicting associations never reassign an existing identity. Explicit user IDs
remain attached to their individual events. SDK reset and switching users rotate
the anonymous ID. All these identifiers are untrusted analytics context.

Worker retries use exponential backoff, capped attempts, durable failure status,
and explicit owner/admin replay. Redis loss is recovered from PostgreSQL outbox
rows. Pending work is never removed by retention. Processed properties are erased
from receipts; analytics events expire after 90 days by default. Failed payloads
expire after 14 days. Minimal deduplication tombstones remain.

SDK buffering is memory-only and bounded. Browser localStorage contains only an
anonymous ID and opt-out preference; storage is optional. Node clients require
explicit identity context per client. There is no DOM autocapture, fingerprinting,
IP capture, or automatic page URL capture.
