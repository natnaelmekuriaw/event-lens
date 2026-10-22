import { z } from 'zod';

export const EVENT_LIMITS = {
  batch: 50,
  payloadBytes: 262144,
  propertiesBytes: 8192,
  depth: 5,
  container: 100,
  lateMs: 30 * 86400000,
  futureMs: 300000,
} as const;
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Properties = { [key: string]: JsonValue };

function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > EVENT_LIMITS.depth) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 4096;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value))
    return (
      value.length <= EVENT_LIMITS.container &&
      value.every((v) => boundedJson(v, depth + 1))
    );
  if (
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return false;
  const entries = Object.entries(value);
  return (
    entries.length <= EVENT_LIMITS.container &&
    entries.every(
      ([key, v]) =>
        key.length > 0 &&
        key.length <= 100 &&
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        boundedJson(v, depth + 1),
    )
  );
}
export const propertiesSchema = z.custom<Properties>((value) => {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    !boundedJson(value)
  )
    return false;
  try {
    return (
      new TextEncoder().encode(JSON.stringify(value)).length <=
      EVENT_LIMITS.propertiesBytes
    );
  } catch {
    return false;
  }
}, 'Properties must be a bounded JSON object');
export const actorIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      value.trim() === value &&
      Array.from(value).every((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && (code < 127 || code > 159);
      }),
    'Invalid actor identifier',
  );
export const eventSchema = z
  .object({
    eventId: z.uuid(),
    type: z.enum(['track', 'identify']),
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_. -]{0,99}$/),
    occurredAt: z.iso.datetime({ offset: true }),
    anonymousId: actorIdSchema,
    userId: actorIdSchema.optional(),
    properties: propertiesSchema.default({}),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (
      event.type === 'identify' &&
      (!event.userId || event.name !== 'identify')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Identify events require userId and name identify',
      });
  });
export const ingestionSchema = z
  .object({
    projectKey: z
      .string()
      .regex(/^el_pk_[A-Za-z0-9_-]{32,}$/)
      .max(128),
    events: z.array(eventSchema).min(1).max(EVENT_LIMITS.batch),
  })
  .strict();
export type TrackingEvent = z.infer<typeof eventSchema>;
export function validEventTime(time: string, now = Date.now()): boolean {
  const value = Date.parse(time);
  return (
    Number.isFinite(value) &&
    value >= now - EVENT_LIMITS.lateMs &&
    value <= now + EVENT_LIMITS.futureMs
  );
}
export interface IngestionResult {
  accepted: number;
  duplicates: number;
  receivedAt: string;
}
export interface StoredEvent extends Omit<TrackingEvent, 'userId'> {
  id: string;
  projectId: string;
  userId: string | null;
  receivedAt: string;
  identityConflict: boolean;
}
export const eventQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.uuid().optional(),
    name: z.string().max(100).optional(),
    actor: actorIdSchema.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to),
    'from must precede to',
  );
export type EventQuery = z.infer<typeof eventQuerySchema>;
export interface ProcessingSummary {
  pending: number;
  failed: number;
  processed: number;
  expired: number;
}
export interface FailedReceipt {
  id: string;
  eventId: string;
  attempts: number;
  receivedAt: string;
  errorCode: string | null;
}
