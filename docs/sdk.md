# SDK usage

`@eventlens/sdk` is a private workspace package for browser bundles and Node.
It exports `createEventLens`, `DeliveryError`, and shared TypeScript types.
Build contracts and the SDK before using them from another workspace package.

The endpoint is the EventLens base URL. The client appends `/api/v1/ingest`;
do not pass that route itself. HTTP and HTTPS are supported; use HTTPS outside
local development. URLs with credentials, query strings, or fragments are rejected.

## Browser

```ts
import { createEventLens } from '@eventlens/sdk';

const analytics = createEventLens({
  endpoint: 'https://analytics.example.com',
  projectKey: 'el_pk_your_public_project_key',
  onError(code) {
    console.warn('Analytics delivery:', code);
  },
});

analytics.track('game_started', { mode: 'practice' });
analytics.identify('player-42');
analytics.track('level_completed', { level: 1 });
await analytics.flush();

// At logout or when a different anonymous visitor begins:
analytics.reset();
```

`track` and `identify` return whether an event entered the memory buffer.
They return false for opt-out, a destroyed client, invalid input, or a full buffer.
A true return value is not delivery confirmation. `onError` receives
`INVALID_EVENT`, `BUFFER_FULL`, or `DELIVERY_FAILED`; errors thrown by that
callback are contained.

Each event gets a UUID and client occurrence time. Properties are copied when
queued so subsequent mutation cannot change a queued event.

Browser identity defaults to a random anonymous UUID. Only that anonymous ID and
the opt-out preference are stored in localStorage; user IDs and event buffers are
not persisted. Denied storage falls back to memory. Supply `storage: false` to
disable storage or a `StorageAdapter` with getItem/setItem/removeItem methods.
`storageKey` controls the key namespace; the default uses a project-key suffix.

## Node: isolate each actor

Node clients require an explicit context. Create a client for one request or
actor; sharing a mutable client between unrelated requests can mix identities.

```ts
import { createEventLens } from '@eventlens/sdk';

const analytics = createEventLens({
  runtime: 'node',
  endpoint: 'https://analytics.example.com',
  projectKey: process.env.EVENTLENS_PUBLIC_KEY!,
  context: {
    anonymousId: requestScopedAnonymousId,
    userId: authenticatedUserId,
  },
  flushIntervalMs: 0,
});

try {
  analytics.track('order_completed', { item_count: 2 });
  await analytics.flush();
} finally {
  analytics.destroy();
}
```

Provide a stable, opaque anonymous identifier from your application's explicit
context. Omit userId for an anonymous actor. Do not send emails or secrets as
identifiers. Node `reset` also requires an explicit context. There are no
automatic process exit hooks; await `flush` before normal shutdown.

## Buffering and delivery

| Option            | Default                                | Allowed values                         |
| ----------------- | -------------------------------------- | -------------------------------------- |
| `bufferSize`      | 500 events, including in-flight events | 1–10,000                               |
| `batchSize`       | 20 events                              | 1–50                                   |
| `flushIntervalMs` | 5,000 ms                               | 0–60,000; zero disables periodic flush |
| `timeoutMs`       | 5,000 ms per request                   | 100–30,000                             |
| `maxRetries`      | 3 retries after the first attempt      | 0–5                                    |

A flush drains the events buffered when it began. Events queued during that
flush wait for a later flush. Concurrent calls share the active flush promise.
The client reduces batch size to keep a request near 60,000 UTF-8 bytes for
browser keepalive compatibility.

Only HTTP 202 confirms delivery. Network errors, timeouts, 408, 429, and server
errors retry with the same event IDs using exponential delay and jitter. Other
HTTP errors fail immediately. After retries are exhausted, that batch is dropped,
`onError` receives `DELIVERY_FAILED`, and explicit `flush` rejects with
`DeliveryError`. Other buffered events remain available for a later flush.
There is no disk spool or offline replay; reloads, crashes, and browser shutdown
can lose events that have not received 202.

The SDK attempts a keepalive flush on pagehide and when the page becomes hidden.
Browser keepalive budgets and process termination make this best effort. An
existing in-flight request is reused. Do not rely on shutdown capture for
critical business records.

`pendingCount` includes queued and in-flight events. `destroy` stops timers,
removes browser listeners, aborts delivery, and clears queued events; it does not
flush. Await `flush` first when delivery is required.

## Identity and consent

`identify(userId)` queues an identify event and attaches the user ID to later
events. Identifying a different user rotates the anonymous ID first. `reset()`
creates a fresh anonymous browser context. Already queued events keep their
original context.

`setOptOut(true)` clears queued events, aborts the active request, rotates the
anonymous ID, and stores the preference where storage is enabled. It cannot
retract data already accepted by the server. `setOptOut(false)` enables capture
with a fresh anonymous context. The `optOut` constructor option can explicitly
set or override the stored preference.

The SDK does not autocapture the DOM, page URLs, IP addresses, device fingerprints,
or user agent strings. Applications decide which named events and bounded
properties to send. Server identity associations are project-scoped, untrusted
analytics context; see [identity rules](events.md#identity).
