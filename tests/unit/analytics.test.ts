import { describe, expect, it } from 'vitest';
import {
  activityQuerySchema,
  analyticsQuerySchema,
} from '../../packages/contracts/src/analytics.js';

const from = '2026-10-01T00:00:00Z';
const to = '2026-10-31T00:00:00Z';
describe('analytics query contract', () => {
  it('requires a bounded, nonempty instant range', () => {
    expect(analyticsQuerySchema.safeParse({ from, to }).success).toBe(true);
    expect(analyticsQuerySchema.safeParse({ from: to, to: from }).success).toBe(
      false,
    );
    expect(
      analyticsQuerySchema.safeParse({
        from,
        to: '2027-11-01T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      analyticsQuerySchema.safeParse({
        from: '2026-10-01T03:00:00+03:00',
        to: from,
      }).success,
    ).toBe(false);
  });
  it('accepts only paired top-level property filters', () => {
    expect(
      analyticsQuerySchema.safeParse({
        from,
        to,
        propertyKey: 'platform',
      }).success,
    ).toBe(false);
    expect(
      analyticsQuerySchema.safeParse({
        from,
        to,
        propertyKey: 'platform',
        propertyValue: 'browser',
      }).success,
    ).toBe(true);
    expect(
      analyticsQuerySchema.safeParse({
        from,
        to,
        propertyKey: 'platform',
        propertyValue: 'browser',
        operator: 'regex',
      }).success,
    ).toBe(false);
  });
  it('bounds activity paging and requires explicit actor context', () => {
    expect(
      activityQuerySchema.safeParse({
        from,
        to,
        actorType: 'user',
        actorId: 'player-1',
      }).success,
    ).toBe(true);
    expect(
      activityQuerySchema.safeParse({
        from,
        to,
        actorType: 'user',
        actorId: 'player-1',
        limit: 101,
      }).success,
    ).toBe(false);
    expect(
      activityQuerySchema.safeParse({
        from,
        to,
        actorType: 'user',
      }).success,
    ).toBe(false);
  });
});
