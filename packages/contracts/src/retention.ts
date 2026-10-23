import { z } from 'zod';

const eventName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_. -]{0,99}$/);
export const retentionQuerySchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    entryEvent: eventName,
    returnEvent: eventName,
    days: z.coerce.number().int().min(1).max(30).default(7),
    entryPropertyKey: z.string().min(1).max(100).optional(),
    entryPropertyValue: z.string().max(200).optional(),
    returnPropertyKey: z.string().min(1).max(100).optional(),
    returnPropertyValue: z.string().max(200).optional(),
  })
  .strict()
  .refine((value) => {
    const duration = Date.parse(value.to) - Date.parse(value.from);
    return duration > 0 && duration <= 90 * 86400000;
  }, 'Choose a nonempty cohort range of at most 90 calendar days')
  .refine(
    (value) =>
      (value.entryPropertyKey === undefined) ===
      (value.entryPropertyValue === undefined),
    'Supply both entry property fields',
  )
  .refine(
    (value) =>
      (value.returnPropertyKey === undefined) ===
      (value.returnPropertyValue === undefined),
    'Supply both return property fields',
  );
export type RetentionQuery = z.infer<typeof retentionQuerySchema>;
export interface RetentionCell {
  day: number;
  users: number | null;
  rate: number | null;
}
export interface RetentionCohort {
  date: string;
  size: number;
  cells: RetentionCell[];
}
export interface RetentionResult {
  from: string;
  to: string;
  timezone: string;
  asOf: string;
  entryEvent: string;
  returnEvent: string;
  days: number;
  cohorts: RetentionCohort[];
}
