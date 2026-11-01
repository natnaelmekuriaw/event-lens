import { describe, expect, it } from 'vitest';
import {
  analyticsCsv,
  conversionCsv,
  csv,
  eventsCsv,
  retentionCsv,
  topEventsCsv,
} from '../../apps/web/src/lib/csv';

describe('CSV export', () => {
  it('quotes text, preserves newlines, and neutralizes spreadsheet formulas', () => {
    expect(
      csv([
        ['name', 'value'],
        ['a,"b"\nc', '=HYPERLINK("x")'],
      ]),
    ).toBe('"name","value"\r\n"a,""b""\nc","\'=HYPERLINK(""x"")"\r\n');
  });

  it('keeps unavailable retention cells empty rather than zero', () => {
    const output = retentionCsv({
      from: '2026-01-01',
      to: '2026-01-02',
      timezone: 'UTC',
      asOf: '2026-01-02T00:00:00Z',
      entryEvent: 'signup',
      returnEvent: 'open',
      days: 1,
      cohorts: [
        {
          date: '2026-01-01',
          size: 3,
          cells: [{ day: 1, users: null, rate: null }],
        },
      ],
    });
    expect(output).toContain('"2026-01-01","3","1","",""');
  });

  it('guards actor identifiers and quotes event properties', () => {
    const output = eventsCsv([
      {
        id: 'stored',
        projectId: 'project',
        eventId: 'event',
        type: 'track',
        name: 'signup',
        occurredAt: '2026-01-01T00:00:00Z',
        receivedAt: '2026-01-01T00:00:01Z',
        anonymousId: '=SUM(1)',
        userId: null,
        identityConflict: false,
        properties: { plan: '"pro"' },
      },
    ]);
    expect(output).toContain('"\'=SUM(1)"');
    expect(output).toContain('""plan""');
  });

  it('exports displayed analytics periods and top events with range context', () => {
    const report = {
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-02T00:00:00Z',
      timezone: 'Africa/Nairobi',
      bucket: 'day' as const,
      totalEvents: 2,
      activeUsers: 1,
      series: [{ date: '2026-01-01', events: 2, activeUsers: 1 }],
      topEvents: [{ name: 'signup', count: 2 }],
    };
    expect(analyticsCsv(report)).toContain('"2026-01-01","2","1"');
    expect(analyticsCsv(report)).toContain('"Africa/Nairobi"');
    expect(topEventsCsv(report)).toContain('"signup","2"');
  });

  it('exports conversion rates as fractions with their counted steps', () => {
    const output = conversionCsv({
      funnelId: 'path',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-02T00:00:00Z',
      asOf: '2026-01-03T00:00:00Z',
      entries: 4,
      windowMinutes: 60,
      steps: [
        {
          step: 1,
          name: 'signup',
          users: 4,
          dropoff: 0,
          rateFromStart: 1,
          rateFromPrevious: 1,
        },
        {
          step: 2,
          name: 'purchase',
          users: 1,
          dropoff: 3,
          rateFromStart: 0.25,
          rateFromPrevious: 0.25,
        },
      ],
    });
    expect(output).toContain('"2","purchase","1","3","0.25","0.25"');
  });
});
