import { describe, expect, it } from 'vitest';
import { csv, eventsCsv, retentionCsv } from '../../apps/web/src/lib/csv';

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
});
