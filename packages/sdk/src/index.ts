import {
  actorIdSchema,
  eventSchema,
  type Properties,
  type TrackingEvent,
} from '@eventlens/contracts';
import {
  anonymousId,
  defaultStorage,
  readStorage,
  writeStorage,
  type IdentityContext,
  type StorageAdapter,
} from './identity.js';
export type { IdentityContext, StorageAdapter } from './identity.js';
export type { Properties } from '@eventlens/contracts';

export interface EventLensOptions {
  endpoint: string;
  projectKey: string;
  runtime?: 'browser' | 'node';
  context?: IdentityContext;
  storage?: StorageAdapter | false;
  storageKey?: string;
  optOut?: boolean;
  bufferSize?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
  onError?: (code: 'INVALID_EVENT' | 'BUFFER_FULL' | 'DELIVERY_FAILED') => void;
}
export interface EventLens {
  track(name: string, properties?: Properties): boolean;
  identify(userId: string): boolean;
  reset(context?: IdentityContext): void;
  flush(): Promise<void>;
  setOptOut(value: boolean): void;
  getIdentity(): IdentityContext;
  readonly pendingCount: number;
  destroy(): void;
}
export class DeliveryError extends Error {
  constructor(readonly status: number | null) {
    super('EventLens batch could not be delivered');
  }
}
function integer(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max)
    throw new Error('Invalid EventLens buffer or timing option');
  return result;
}
export function createEventLens(options: EventLensOptions): EventLens {
  const endpoint = new URL(options.endpoint);
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error('Use an HTTP(S) endpoint without credentials or query');
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/api/v1/ingest';
  if (!/^el_pk_[A-Za-z0-9_-]{32,}$/.test(options.projectKey))
    throw new Error('Invalid EventLens public project key');
  const runtime =
    options.runtime ?? (typeof window === 'undefined' ? 'node' : 'browser');
  if (runtime === 'node' && !options.context)
    throw new Error(
      'Node clients require an explicit context; create one client per request or actor',
    );
  if (
    options.context &&
    (!actorIdSchema.safeParse(options.context.anonymousId).success ||
      (options.context.userId !== undefined &&
        !actorIdSchema.safeParse(options.context.userId).success))
  )
    throw new Error('Invalid EventLens identity context');
  const capacity = integer(options.bufferSize, 500, 1, 10000);
  const batchSize = integer(options.batchSize, 20, 1, 50);
  const interval = integer(options.flushIntervalMs, 5000, 0, 60000);
  const timeout = integer(options.timeoutMs, 5000, 100, 30000);
  const maxRetries = integer(options.maxRetries, 3, 0, 5);
  const storage =
    runtime === 'browser' && options.storage !== false
      ? (options.storage ?? defaultStorage())
      : undefined;
  const storageKey =
    options.storageKey ?? 'eventlens:' + options.projectKey.slice(-16);
  let optedOut =
    options.optOut ?? readStorage(storage, storageKey + ':optout') === '1';
  const stored = readStorage(storage, storageKey + ':anonymous');
  let identity: IdentityContext = options.context
    ? { ...options.context }
    : {
        anonymousId:
          stored && actorIdSchema.safeParse(stored).success
            ? stored
            : anonymousId(),
      };
  let destroyed = false;
  let buffer: TrackingEvent[] = [];
  let active: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let inFlightCount = 0;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const report = (
    code: Parameters<NonNullable<EventLensOptions['onError']>>[0],
  ) => {
    try {
      options.onError?.(code);
    } catch {
      /* Telemetry must not break the application. */
    }
  };
  const persist = () =>
    writeStorage(
      storage,
      storageKey + ':anonymous',
      optedOut ? null : identity.anonymousId,
    );
  if (options.optOut !== undefined)
    writeStorage(storage, storageKey + ':optout', optedOut ? '1' : null);
  persist();
  function enqueue(
    type: TrackingEvent['type'],
    name: string,
    properties: Properties,
  ): boolean {
    if (destroyed || optedOut) return false;
    if (buffer.length + inFlightCount >= capacity) {
      report('BUFFER_FULL');
      return false;
    }
    const parsed = eventSchema.safeParse({
      eventId: globalThis.crypto.randomUUID(),
      type,
      name,
      occurredAt: new Date().toISOString(),
      ...identity,
      properties,
    });
    if (!parsed.success) {
      report('INVALID_EVENT');
      return false;
    }
    buffer.push(JSON.parse(JSON.stringify(parsed.data)) as TrackingEvent);
    return true;
  }
  async function deliver(events: TrackingEvent[], keepalive: boolean) {
    const body = JSON.stringify({ projectKey: options.projectKey, events });
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (optedOut || destroyed) return;
      controller = new AbortController();
      const timer = setTimeout(() => controller?.abort(), timeout);
      let status: number | null = null;
      let retryable = true;
      try {
        const response = await send(endpoint.href, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
          keepalive,
        });
        status = response.status;
        if (response.status === 202) return;
        retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
      } catch {
        /* Network and timeout failures share the bounded retry path. */
      } finally {
        clearTimeout(timer);
        controller = undefined;
      }
      if (optedOut || destroyed) return;
      if (!retryable || attempt === maxRetries) throw new DeliveryError(status);
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(30000, 1000 * 2 ** attempt) +
            Math.floor(Math.random() * 250),
        ),
      );
    }
  }
  function flush(keepalive = false): Promise<void> {
    if (active) return active;
    if (destroyed || optedOut || !buffer.length) return Promise.resolve();
    const target = buffer.length;
    active = (async () => {
      let remaining = target;
      while (remaining > 0 && buffer.length && !optedOut && !destroyed) {
        let count = Math.min(batchSize, remaining, buffer.length);
        while (
          count > 1 &&
          new TextEncoder().encode(
            JSON.stringify({
              projectKey: options.projectKey,
              events: buffer.slice(0, count),
            }),
          ).length > 60000
        )
          count--;
        const batch = buffer.splice(0, count);
        remaining -= batch.length;
        inFlightCount = batch.length;
        try {
          await deliver(batch, keepalive);
        } catch (error) {
          report('DELIVERY_FAILED');
          throw error;
        } finally {
          inFlightCount = 0;
        }
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  }
  const backgroundFlush = () => {
    void flush().catch(() => {});
  };
  const shutdownFlush = () => {
    if (
      typeof document === 'undefined' ||
      document.visibilityState === 'hidden'
    )
      void flush(true).catch(() => {});
  };
  const timer =
    interval > 0 ? setInterval(backgroundFlush, interval) : undefined;
  timer?.unref?.();
  if (runtime === 'browser' && typeof window !== 'undefined') {
    window.addEventListener('pagehide', shutdownFlush);
    document.addEventListener('visibilitychange', shutdownFlush);
  }
  return {
    track: (name, properties = {}) => enqueue('track', name, properties),
    identify(userId) {
      if (!actorIdSchema.safeParse(userId).success || optedOut || destroyed)
        return false;
      if (identity.userId && identity.userId !== userId)
        identity = { anonymousId: anonymousId() };
      identity = { ...identity, userId };
      persist();
      return enqueue('identify', 'identify', {});
    },
    reset(context) {
      if (runtime === 'node' && !context)
        throw new Error('Node reset requires explicit context');
      if (
        context &&
        (!actorIdSchema.safeParse(context.anonymousId).success ||
          (context.userId !== undefined &&
            !actorIdSchema.safeParse(context.userId).success))
      )
        throw new Error('Invalid identity context');
      identity = context ? { ...context } : { anonymousId: anonymousId() };
      persist();
    },
    flush: () => flush(),
    setOptOut(value) {
      optedOut = value;
      writeStorage(storage, storageKey + ':optout', value ? '1' : null);
      if (value) {
        buffer = [];
        controller?.abort();
      }
      identity = { anonymousId: anonymousId() };
      persist();
    },
    getIdentity: () => ({ ...identity }),
    get pendingCount() {
      return buffer.length + inFlightCount;
    },
    destroy() {
      destroyed = true;
      buffer = [];
      controller?.abort();
      if (timer) clearInterval(timer);
      if (runtime === 'browser' && typeof window !== 'undefined') {
        window.removeEventListener('pagehide', shutdownFlush);
        document.removeEventListener('visibilitychange', shutdownFlush);
      }
    },
  };
}
