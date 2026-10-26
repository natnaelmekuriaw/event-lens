import { afterEach, expect, test, vi } from 'vitest';
import { api, ApiFailure } from '../../apps/web/src/lib/api';

afterEach(() => vi.unstubAllGlobals());

test('retries one plain-text proxy failure for a read', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    )
    .mockResolvedValueOnce(
      Response.json({ items: ['recovered'] }, { status: 200 }),
    );
  vi.stubGlobal('fetch', fetch);

  await expect(api('/projects')).resolves.toEqual({ items: ['recovered'] });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('does not retry an API error or a write', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ message: 'Query failed' }, { status: 500 }),
    )
    .mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );
  vi.stubGlobal('fetch', fetch);

  await expect(api('/projects')).rejects.toThrow(
    new ApiFailure(500, 'Query failed'),
  );
  await expect(api('/projects', { method: 'POST' })).rejects.toThrow(
    new ApiFailure(500, 'Unable to complete the request'),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});
