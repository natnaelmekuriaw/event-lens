import { describe, expect, it } from 'vitest';
import { bucketDates } from '../../apps/api/src/analytics/buckets.js';

describe('project timezone buckets', () => {
  it('includes every local day across daylight saving changes', () => {
    expect(
      bucketDates(
        '2026-03-07T05:00:00Z',
        '2026-03-10T04:00:00Z',
        'America/New_York',
        'day',
      ),
    ).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
  });
  it('uses Monday ISO week starts and local month boundaries', () => {
    expect(
      bucketDates(
        '2026-10-04T12:00:00Z',
        '2026-10-06T12:00:00Z',
        'UTC',
        'week',
      ),
    ).toEqual(['2026-09-28', '2026-10-05']);
    expect(
      bucketDates(
        '2026-10-31T21:30:00Z',
        '2026-11-01T22:00:00Z',
        'Africa/Nairobi',
        'month',
      ),
    ).toEqual(['2026-11-01']);
  });
  it('treats the end instant as exclusive', () => {
    expect(
      bucketDates('2026-10-01T12:00:00Z', '2026-10-02T00:00:00Z', 'UTC', 'day'),
    ).toEqual(['2026-10-01']);
  });
});
