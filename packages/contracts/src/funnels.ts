import { z } from 'zod';

export const FUNNEL_LIMITS = {
  steps: 6,
  rangeDays: 90,
  windowMinutes: 43200,
  actors: 100000,
} as const;
export const funnelStepSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_. -]{0,99}$/),
    propertyKey: z.string().min(1).max(100).optional(),
    propertyValue: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (step) =>
      (step.propertyKey === undefined) === (step.propertyValue === undefined),
    'Property key and value must be supplied together',
  );
export type FunnelStep = z.infer<typeof funnelStepSchema>;
export const funnelDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    steps: z.array(funnelStepSchema).min(2).max(FUNNEL_LIMITS.steps),
    windowMinutes: z.number().int().min(1).max(FUNNEL_LIMITS.windowMinutes),
  })
  .strict();
export type FunnelDefinitionInput = z.infer<typeof funnelDefinitionSchema>;
export const funnelRangeSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((range) => {
    const duration = Date.parse(range.to) - Date.parse(range.from);
    return duration > 0 && duration <= FUNNEL_LIMITS.rangeDays * 86400000;
  }, 'Use a nonempty range of at most 90 days');
export type FunnelRange = z.infer<typeof funnelRangeSchema>;
export interface SavedFunnel extends FunnelDefinitionInput {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}
export interface FunnelStepResult {
  step: number;
  name: string;
  users: number;
  dropoff: number;
  rateFromStart: number;
  rateFromPrevious: number;
}
export interface FunnelResult {
  funnelId: string;
  from: string;
  to: string;
  asOf: string;
  entries: number;
  windowMinutes: number;
  steps: FunnelStepResult[];
}
