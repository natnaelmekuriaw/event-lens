import { z } from 'zod';
import { actorIdSchema } from './events.js';

const dateTime = z.iso.datetime({ offset: true });
const filter = {
  name: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_. -]{0,99}$/)
    .optional(),
  propertyKey: z.string().min(1).max(100).optional(),
  propertyValue: z.string().max(200).optional(),
};
function validRange(value: { from: string; to: string }): boolean {
  const duration = Date.parse(value.to) - Date.parse(value.from);
  return duration > 0 && duration <= 366 * 86400000;
}
export const analyticsQuerySchema = z
  .object({
    from: dateTime,
    to: dateTime,
    bucket: z.enum(['day', 'week', 'month']).default('day'),
    ...filter,
  })
  .strict()
  .refine(validRange, 'Use a nonempty range of at most 366 days')
  .refine(
    (value) =>
      (value.propertyKey === undefined) === (value.propertyValue === undefined),
    'Property key and value must be supplied together',
  );
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export interface AnalyticsBucket {
  date: string;
  events: number;
  activeUsers: number;
}
export interface TopEvent {
  name: string;
  count: number;
}
export interface AnalyticsOverview {
  from: string;
  to: string;
  timezone: string;
  bucket: AnalyticsQuery['bucket'];
  totalEvents: number;
  activeUsers: number;
  series: AnalyticsBucket[];
  topEvents: TopEvent[];
}
export const activityQuerySchema = z
  .object({
    from: dateTime,
    to: dateTime,
    actorType: z.enum(['user', 'anonymous']),
    actorId: actorIdSchema,
    name: filter.name,
    propertyKey: filter.propertyKey,
    propertyValue: filter.propertyValue,
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.uuid().optional(),
  })
  .strict()
  .refine(validRange, 'Use a nonempty range of at most 366 days')
  .refine(
    (value) =>
      (value.propertyKey === undefined) === (value.propertyValue === undefined),
    'Property key and value must be supplied together',
  );
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
