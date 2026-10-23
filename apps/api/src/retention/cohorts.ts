import type { RetentionCohort, RetentionQuery } from '@eventlens/contracts';
import { localDate } from '../analytics/buckets.js';

export interface RetentionRow {
  date: string;
  day: number;
  users: bigint;
}
export function cohortTable(
  query: RetentionQuery,
  rows: RetentionRow[],
  timezone: string,
  asOf: Date,
): RetentionCohort[] {
  const today = localDate(asOf.toISOString(), timezone);
  const counts = new Map(
    rows.map((row) => [`${row.date}:${row.day}`, Number(row.users)]),
  );
  const cohorts: RetentionCohort[] = [];
  for (
    let date = Date.parse(query.from);
    date < Date.parse(query.to);
    date += 86400000
  ) {
    const label = new Date(date).toISOString().slice(0, 10);
    const size = counts.get(`${label}:0`) ?? 0;
    cohorts.push({
      date: label,
      size,
      cells: Array.from({ length: query.days + 1 }, (_, day) => {
        const observedDate = new Date(date + day * 86400000)
          .toISOString()
          .slice(0, 10);
        const users = counts.get(`${label}:${day}`) ?? 0;
        return observedDate >= today
          ? { day, users: null, rate: null }
          : { day, users, rate: size ? users / size : 0 };
      }),
    });
  }
  return cohorts;
}
