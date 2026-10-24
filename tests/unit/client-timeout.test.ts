import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../apps/web/src/lib/api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('keeps the timeout when a caller supplies cancellation', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    (_path: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal!.addEventListener(
          'abort',
          () => reject(options.signal!.reason),
          { once: true },
        );
      }),
  );
  // Native AbortSignal.timeout uses real timers; substitute only its clock.
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('Timed out')), delay);
    return controller.signal;
  });
  const controller = new AbortController();
  const request = api('/retention', { signal: controller.signal });
  const rejected = expect(request).rejects.toThrow('Timed out');
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  expect(controller.signal.aborted).toBe(false);
  vi.restoreAllMocks();
});
it('preserves caller cancellation before the timeout', async () => {
  vi.stubGlobal(
    'fetch',
    (_path: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal!.addEventListener(
          'abort',
          () => reject(new Error('Cancelled')),
          { once: true },
        );
      }),
  );
  const controller = new AbortController();
  const request = api('/retention', { signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toThrow('Cancelled');
});
