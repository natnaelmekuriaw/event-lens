import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEventLens,
  type EventLens,
  DeliveryError,
  type StorageAdapter,
} from '../../packages/sdk/src/index.js';
const key = 'el_pk_' + 'a'.repeat(48);
const clients: EventLens[] = [];
function client(options: Partial<Parameters<typeof createEventLens>[0]> = {}) {
  const value = createEventLens({
    endpoint: 'http://localhost:3001',
    projectKey: key,
    runtime: 'node',
    context: { anonymousId: 'request-1' },
    flushIntervalMs: 0,
    ...options,
  });
  clients.push(value);
  return value;
}
afterEach(() => {
  clients.forEach((c) => c.destroy());
  clients.length = 0;
  vi.useRealTimers();
});
describe('SDK delivery and identity', () => {
  it('requires explicit Node context', () => {
    expect(() =>
      createEventLens({
        endpoint: 'http://localhost',
        projectKey: key,
        runtime: 'node',
      }),
    ).toThrow('explicit context');
  });
  it('batches and snapshots properties without cookies', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 202 }));
    const sdk = client({ fetch: send, batchSize: 2 });
    const properties = { score: 10 };
    sdk.track('game_started', properties);
    properties.score = 999;
    sdk.track('level_started');
    sdk.track('game_over');
    await sdk.flush();
    expect(send).toHaveBeenCalledTimes(2);
    const options = send.mock.calls[0]![1]!;
    expect(options.credentials).toBe('omit');
    const batch = JSON.parse(String(options.body));
    expect(batch.events).toHaveLength(2);
    expect(batch.events[0].properties.score).toBe(10);
    expect(sdk.pendingCount).toBe(0);
  });
  it('retries a fixed event ID and bounds attempts', async () => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    const sdk = client({ fetch: send, maxRetries: 2 });
    sdk.track('game_over');
    const result = sdk.flush().catch((error) => error);
    await vi.runAllTimersAsync();
    expect(await result).toBeInstanceOf(DeliveryError);
    expect(send).toHaveBeenCalledTimes(3);
    const ids = send.mock.calls.map(
      (call) => JSON.parse(String(call[1]!.body)).events[0].eventId,
    );
    expect(new Set(ids).size).toBe(1);
    expect(sdk.pendingCount).toBe(0);
  });
  it('does not retry validation failures', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 400 }));
    const sdk = client({ fetch: send });
    sdk.track('invalid_server_event');
    await expect(sdk.flush()).rejects.toMatchObject({ status: 400 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('retries 429 and succeeds', async () => {
    vi.useFakeTimers();
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 202 }));
    const sdk = client({ fetch: send });
    sdk.track('game_started');
    const result = sdk.flush();
    await vi.runAllTimersAsync();
    await result;
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('rejects new events when memory is full', () => {
    const sdk = client({ bufferSize: 1 });
    expect(sdk.track('game_started')).toBe(true);
    expect(sdk.track('game_over')).toBe(false);
    expect(sdk.pendingCount).toBe(1);
  });
  it('serializes concurrent flush calls', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 202 }));
    const sdk = client({ fetch: send });
    sdk.track('game_started');
    await Promise.all([sdk.flush(), sdk.flush()]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('rotates shared-device identity when changing users and resetting', () => {
    const sdk = client();
    const first = sdk.getIdentity().anonymousId;
    sdk.identify('alice');
    expect(sdk.getIdentity().anonymousId).toBe(first);
    sdk.identify('bob');
    expect(sdk.getIdentity().anonymousId).not.toBe(first);
    sdk.reset({ anonymousId: 'next-request' });
    expect(sdk.getIdentity()).toEqual({ anonymousId: 'next-request' });
    expect(() => sdk.reset()).toThrow('explicit context');
  });
  it('persists only anonymous identity and opt-out preference', () => {
    const values = new Map<string, string>();
    const storage: StorageAdapter = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    const sdk = client({ runtime: 'browser', storage, context: undefined });
    sdk.identify('private-user');
    sdk.track('game_started');
    sdk.setOptOut(true);
    expect(sdk.pendingCount).toBe(0);
    expect(sdk.track('game_over')).toBe(false);
    expect([...values.values()]).not.toContain('private-user');
    const next = client({ runtime: 'browser', storage, context: undefined });
    expect(next.track('game_started')).toBe(false);
  });
  it('survives unavailable storage and rejects invalid properties', () => {
    const storage: StorageAdapter = {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
      removeItem() {
        throw Error();
      },
    };
    const sdk = client({ runtime: 'browser', context: undefined, storage });
    expect(sdk.track('game_started')).toBe(true);
    expect(sdk.track('', {})).toBe(false);
    expect(sdk.track('game_over', { score: Infinity })).toBe(false);
  });
  it('aborts an in-flight request when opted out', async () => {
    const send = vi.fn<typeof fetch>().mockImplementation(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const sdk = client({ fetch: send });
    sdk.track('game_started');
    const result = sdk.flush();
    sdk.setOptOut(true);
    await result;
    expect(send).toHaveBeenCalledTimes(1);
  });
});
