import type { AnalyticsQuery } from '@eventlens/contracts';

export function localDate(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: string) =>
    parts.find((value) => value.type === type)!.value;
  return [part('year'), part('month'), part('day')].join('-');
}
function bucketStart(date: string, bucket: AnalyticsQuery['bucket']): Date {
  const value = new Date(date + 'T00:00:00Z');
  if (bucket === 'month') value.setUTCDate(1);
  if (bucket === 'week')
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value;
}
export function bucketDates(
  from: string,
  to: string,
  timezone: string,
  bucket: AnalyticsQuery['bucket'],
): string[] {
  const first = bucketStart(localDate(from, timezone), bucket);
  const last = bucketStart(
    localDate(new Date(Date.parse(to) - 1).toISOString(), timezone),
    bucket,
  );
  const dates: string[] = [];
  for (const value = first; value <= last;) {
    dates.push(value.toISOString().slice(0, 10));
    if (bucket === 'month') value.setUTCMonth(value.getUTCMonth() + 1);
    else value.setUTCDate(value.getUTCDate() + (bucket === 'week' ? 7 : 1));
  }
  return dates;
}
