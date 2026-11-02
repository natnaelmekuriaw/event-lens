import type {
  AnalyticsOverview,
  FunnelResult,
  RetentionResult,
  StoredEvent,
} from '@eventlens/contracts';

type Cell = string | number | null;

function escapeCell(value: Cell): string {
  const text = value === null ? '' : String(value);
  const safe =
    typeof value === 'string' &&
    (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
      ? `'${text}`
      : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function csv(rows: readonly (readonly Cell[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

export function analyticsCsv(report: AnalyticsOverview): string {
  return csv([
    ['date', 'events', 'active_users', 'timezone', 'bucket', 'from', 'to'],
    ...report.series.map((point) => [
      point.date,
      point.events,
      point.activeUsers,
      report.timezone,
      report.bucket,
      report.from,
      report.to,
    ]),
  ]);
}

export function topEventsCsv(report: AnalyticsOverview): string {
  return csv([
    ['event_name', 'count', 'from', 'to'],
    ...report.topEvents.map((event) => [
      event.name,
      event.count,
      report.from,
      report.to,
    ]),
  ]);
}

export function conversionCsv(report: FunnelResult): string {
  return csv([
    [
      'step',
      'event_name',
      'people',
      'dropoff',
      'rate_from_start',
      'rate_from_previous',
      'from',
      'to',
      'as_of',
    ],
    ...report.steps.map((step) => [
      step.step,
      step.name,
      step.users,
      step.dropoff,
      step.rateFromStart,
      step.rateFromPrevious,
      report.from,
      report.to,
      report.asOf,
    ]),
  ]);
}

export function retentionCsv(report: RetentionResult): string {
  return csv([
    [
      'cohort_date',
      'cohort_size',
      'day',
      'people',
      'rate',
      'timezone',
      'entry_event',
      'return_event',
      'as_of',
    ],
    ...report.cohorts.flatMap((cohort) =>
      cohort.cells.map((cell) => [
        cohort.date,
        cohort.size,
        cell.day,
        cell.users,
        cell.rate,
        report.timezone,
        report.entryEvent,
        report.returnEvent,
        report.asOf,
      ]),
    ),
  ]);
}

export function eventsCsv(events: readonly StoredEvent[]): string {
  return csv([
    [
      'event_id',
      'name',
      'type',
      'occurred_at',
      'received_at',
      'anonymous_id',
      'user_id',
      'identity_conflict',
      'properties_json',
    ],
    ...events.map((event) => [
      event.eventId,
      event.name,
      event.type,
      event.occurredAt,
      event.receivedAt,
      event.anonymousId,
      event.userId,
      String(event.identityConflict),
      JSON.stringify(event.properties) ?? '',
    ]),
  ]);
}

export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob(['\uFEFF', contents], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
