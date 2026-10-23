import { describe, expect, it } from 'vitest';
import { retentionQuerySchema } from '../../packages/contracts/src/retention.js';
import { cohortTable } from '../../apps/api/src/retention/cohorts.js';

const query = retentionQuerySchema.parse({
  from: '2026-03-07',
  to: '2026-03-10',
  entryEvent: 'start',
  returnEvent: 'return',
  days: 3,
});
describe('daily retention contracts', () => {
  it('rejects invalid dates, excessive windows, unknown fields, and unpaired filters', () => {
    for (const changed of [
      { from: '2026-02-30' },
      { to: query.from },
      { days: 31 },
      { to: '2026-12-31' },
      { entryPropertyKey: 'plan' },
      { extra: true },
    ])
      expect(
        retentionQuerySchema.safeParse({ ...query, ...changed }).success,
      ).toBe(false);
  });
});
describe('cohort observation periods', () => {
  it('uses the original denominator and distinguishes zero from unavailable', () => {
    const rows = [
      { date: '2026-03-07', day: 0, users: 4n },
      { date: '2026-03-07', day: 1, users: 2n },
    ];
    const table = cohortTable(
      query,
      rows,
      'UTC',
      new Date('2026-03-10T12:00:00Z'),
    );
    expect(table[0]?.cells).toEqual([
      { day: 0, users: 4, rate: 1 },
      { day: 1, users: 2, rate: 0.5 },
      { day: 2, users: 0, rate: 0 },
      { day: 3, users: null, rate: null },
    ]);
    expect(table[1]?.size).toBe(0);
    expect(table[1]?.cells[0]).toEqual({ day: 0, users: 0, rate: 0 });
  });
  it('uses local dates across the spring daylight saving transition', () => {
    const table = cohortTable(
      query,
      [],
      'America/New_York',
      new Date('2026-03-09T03:30:00Z'),
    );
    expect(table[0]?.cells[1]?.users).toBeNull();
    expect(table[0]?.cells[0]?.users).toBe(0);
    expect(table.map((cohort) => cohort.date)).toEqual([
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
    ]);
  });
  it('keeps day zero unavailable until its local day ends', () => {
    const table = cohortTable(
      query,
      [],
      'Asia/Tokyo',
      new Date('2026-03-08T16:00:00Z'),
    );
    expect(table[1]?.cells[0]?.users).toBe(0);
    expect(table[2]?.cells[0]?.users).toBeNull();
  });
});
