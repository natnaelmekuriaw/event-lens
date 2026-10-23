import { describe, expect, it } from 'vitest';
import {
  eventQuerySchema,
  eventSchema,
  ingestionSchema,
  propertiesSchema,
  validEventTime,
} from '../../packages/contracts/src/events.js';
import { ProjectRateLimiter } from '../../apps/api/src/events/rate-limit.js';
import { identityConflict } from '../../packages/pipeline/src/processor.js';
const event = {
  eventId: '8bccd5ae-1a6f-47aa-a447-1d07b51c301a',
  type: 'track',
  name: 'game_started',
  anonymousId: 'anonymous',
  occurredAt: new Date().toISOString(),
  properties: {},
};
describe('event boundaries', () => {
  it('compares timestamp filters by instant across offsets', () => {
    expect(
      eventQuerySchema.safeParse({
        from: '2026-10-22T12:00:00+03:00',
        to: '2026-10-22T10:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      eventQuerySchema.safeParse({
        from: '2026-10-22T12:00:00Z',
        to: '2026-10-22T13:00:00+03:00',
      }).success,
    ).toBe(false);
  });
  it('rejects invalid identifiers and unknown fields', () => {
    expect(
      eventSchema.safeParse({ ...event, anonymousId: ' bad' }).success,
    ).toBe(false);
    expect(eventSchema.safeParse({ ...event, secret: true }).success).toBe(
      false,
    );
  });
  it('requires explicit identity events to carry a user', () => {
    expect(
      eventSchema.safeParse({ ...event, name: 'identify', type: 'identify' })
        .success,
    ).toBe(false);
  });
  it('bounds batches and nested properties', () => {
    expect(
      ingestionSchema.safeParse({
        projectKey: 'el_pk_' + 'x'.repeat(48),
        events: Array(51).fill(event),
      }).success,
    ).toBe(false);
    expect(
      propertiesSchema.safeParse({ value: 'x'.repeat(8192) }).success,
    ).toBe(false);
    let nested: unknown = 1;
    for (let i = 0; i < 8; i++) nested = { child: nested };
    expect(propertiesSchema.safeParse(nested).success).toBe(false);
    expect(
      propertiesSchema.safeParse(JSON.parse('{"__proto__":1}')).success,
    ).toBe(false);
  });
  it('accepts exact late and future boundaries', () => {
    const now = Date.now();
    expect(
      validEventTime(new Date(now - 30 * 86400000).toISOString(), now),
    ).toBe(true);
    expect(
      validEventTime(new Date(now - 30 * 86400000 - 1).toISOString(), now),
    ).toBe(false);
    expect(validEventTime(new Date(now + 300001).toISOString(), now)).toBe(
      false,
    );
  });
  it('bounds per-project rate windows', () => {
    let now = 0;
    const limiter = new ProjectRateLimiter(2, 1, () => now);
    limiter.consume('a', 2);
    expect(() => limiter.consume('a', 1)).toThrow();
    expect(() => limiter.consume('b', 1)).toThrow();
    now = 60000;
    expect(() => limiter.consume('b', 1)).not.toThrow();
  });
  it('never treats two different identified users as one association', () => {
    expect(identityConflict('alice', 'bob')).toBe(true);
    expect(identityConflict('alice', 'alice')).toBe(false);
    expect(identityConflict(undefined, 'alice')).toBe(false);
  });
});
