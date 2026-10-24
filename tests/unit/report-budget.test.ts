import { afterEach, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@eventlens/database';
import { withReport } from '../../apps/api/src/analytics/report.js';

afterEach(() => vi.restoreAllMocks());

const transaction = { $executeRaw: vi.fn(async () => 0) };
const database = {
  $transaction: async (action: (tx: typeof transaction) => Promise<unknown>) =>
    action(transaction),
} as unknown as PrismaClient;

it('rejects excess reports and admits work again after active reports finish', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const active = Array.from({ length: 4 }, () =>
    withReport(database, () => gate),
  );
  try {
    await expect(
      withReport(database, async () => 'excess'),
    ).rejects.toMatchObject({ status: 429 });
  } finally {
    release();
    await Promise.all(active);
  }
  await expect(withReport(database, async () => 'available')).resolves.toBe(
    'available',
  );
});

it('maps nested database timeouts and releases the report slot on failure', async () => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await expect(
      withReport(database, async () => {
        throw {
          cause: { meta: { driverAdapterError: { originalCode: '57014' } } },
        };
      }),
    ).rejects.toMatchObject({ status: 408 });
  }
  await expect(withReport(database, async () => 'available')).resolves.toBe(
    'available',
  );
});

it('rejects a result returned after the application deadline', async () => {
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  await expect(
    withReport(database, async () => {
      now = 10001;
      return 'late';
    }),
  ).rejects.toMatchObject({ status: 408 });
});

it('preserves ordinary application errors', async () => {
  const failure = new Error('fixture failure');
  await expect(
    withReport(database, async () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
});
