import { describe, expect, it } from 'vitest';
import {
  funnelDefinitionSchema,
  funnelRangeSchema,
} from '../../packages/contracts/src/funnels.js';
import {
  FunnelCounter,
  type FunnelEvent,
} from '../../apps/api/src/funnels/counter.js';

const range = {
  from: '2026-10-01T00:00:00Z',
  to: '2026-10-02T00:00:00Z',
};
const definition = {
  name: 'Level completion',
  steps: [
    { name: 'game_started' },
    { name: 'level_started' },
    { name: 'level_completed' },
  ],
  windowMinutes: 60,
};
function event(
  minute: number,
  actor: string,
  name: string,
  sequence: number,
  properties: FunnelEvent['properties'] = {},
): FunnelEvent {
  return {
    actor,
    eventId: sequence.toString().padStart(4, '0'),
    type: 'track',
    name,
    properties,
    occurredAt: new Date(Date.parse(range.from) + minute * 60000),
  };
}
describe('conversion path contracts', () => {
  it('bounds steps, windows, ranges, and paired property filters', () => {
    expect(funnelDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(
      funnelDefinitionSchema.safeParse({
        ...definition,
        steps: [definition.steps[0]],
      }).success,
    ).toBe(false);
    expect(
      funnelDefinitionSchema.safeParse({
        ...definition,
        windowMinutes: 43201,
      }).success,
    ).toBe(false);
    expect(
      funnelDefinitionSchema.safeParse({
        ...definition,
        steps: [{ name: 'start', propertyKey: 'platform' }, { name: 'end' }],
      }).success,
    ).toBe(false);
    expect(funnelRangeSchema.safeParse(range).success).toBe(true);
    expect(
      funnelRangeSchema.safeParse({
        from: range.from,
        to: '2027-01-01T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});
describe('conversion path counting', () => {
  it('uses the first entry per actor and reports step dropoff', () => {
    const counter = new FunnelCounter(definition, range);
    [
      event(1, 'a', 'game_started', 1),
      event(2, 'a', 'level_started', 2),
      event(3, 'b', 'game_started', 3),
      event(4, 'b', 'game_started', 4),
      event(5, 'b', 'level_started', 5),
      event(6, 'a', 'level_completed', 6),
      event(1441, 'b', 'level_completed', 7),
    ].forEach((value) => counter.consume(value));
    const result = counter.result('path');
    expect(result.entries).toBe(2);
    expect(result.steps.map((step) => step.users)).toEqual([2, 2, 1]);
    expect(result.steps[2]).toMatchObject({
      dropoff: 1,
      rateFromStart: 0.5,
      rateFromPrevious: 0.5,
    });
  });
  it('permits later steps beyond the entry range within the window', () => {
    const counter = new FunnelCounter(
      { ...definition, steps: [{ name: 'start' }, { name: 'finish' }] },
      range,
    );
    counter.consume(event(1439, 'a', 'start', 1));
    counter.consume(event(1440, 'a', 'finish', 2));
    expect(counter.result('path').steps.map((step) => step.users)).toEqual([
      1, 1,
    ]);
  });
  it('does not restart an unsuccessful first attempt', () => {
    const counter = new FunnelCounter(
      { ...definition, steps: [{ name: 'start' }, { name: 'finish' }] },
      range,
    );
    [
      event(1, 'a', 'start', 1),
      event(62, 'a', 'start', 2),
      event(63, 'a', 'finish', 3),
    ].forEach((value) => counter.consume(value));
    expect(counter.result('path').steps.map((step) => step.users)).toEqual([
      1, 0,
    ]);
  });
  it('allows equal timestamps in event ID order but uses each event once', () => {
    const counter = new FunnelCounter(
      {
        ...definition,
        steps: [{ name: 'same' }, { name: 'same' }, { name: 'same' }],
      },
      range,
    );
    [
      event(1, 'a', 'same', 1),
      event(1, 'a', 'same', 2),
      event(1, 'a', 'same', 3),
    ].forEach((value) => counter.consume(value));
    expect(counter.result('path').steps.map((step) => step.users)).toEqual([
      1, 1, 1,
    ]);
  });
  it('includes the conversion-window boundary and excludes later events', () => {
    const counter = new FunnelCounter(
      { ...definition, steps: [{ name: 'start' }, { name: 'finish' }] },
      range,
    );
    [
      event(1, 'a', 'start', 1),
      event(2, 'b', 'start', 2),
      event(61, 'a', 'finish', 3),
      event(63, 'b', 'finish', 4),
    ].forEach((value) => counter.consume(value));
    expect(counter.result('path').steps.map((step) => step.users)).toEqual([
      2, 1,
    ]);
  });
  it('requires exact scalar property values', () => {
    const counter = new FunnelCounter(
      {
        ...definition,
        steps: [
          { name: 'start', propertyKey: 'platform', propertyValue: 'browser' },
          { name: 'finish', propertyKey: 'level', propertyValue: '2' },
        ],
      },
      range,
    );
    [
      event(1, 'a', 'start', 1, { platform: 'browser' }),
      event(2, 'b', 'start', 2, { platform: ['browser'] }),
      event(3, 'a', 'finish', 3, { level: 2 }),
    ].forEach((value) => counter.consume(value));
    expect(counter.result('path').steps.map((step) => step.users)).toEqual([
      1, 1,
    ]);
  });
  it('returns zero rates for empty data and rejects unsorted streams', () => {
    const counter = new FunnelCounter(definition, range);
    expect(counter.result('path').steps[0]).toMatchObject({
      users: 0,
      rateFromStart: 0,
    });
    counter.consume(event(2, 'a', 'game_started', 2));
    expect(() => counter.consume(event(1, 'b', 'game_started', 1))).toThrow(
      'ordered',
    );
  });
});
