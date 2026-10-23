import type {
  FunnelDefinitionInput,
  FunnelRange,
  FunnelResult,
  FunnelStep,
  JsonValue,
} from '@eventlens/contracts';
import { FUNNEL_LIMITS } from '@eventlens/contracts';

export interface FunnelEvent {
  actor: string;
  eventId: string;
  type: string;
  name: string;
  properties: { [key: string]: JsonValue };
  occurredAt: Date;
}
interface Progress {
  entryAt: number;
  lastAt: number;
  lastEventId: string;
  reached: number;
}
export class FunnelTooLargeError extends Error {}
function matches(step: FunnelStep, event: FunnelEvent): boolean {
  if (event.name !== step.name || event.type !== 'track') return false;
  if (step.propertyKey === undefined) return true;
  const value = event.properties[step.propertyKey];
  return (
    (typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean') &&
    String(value) === step.propertyValue
  );
}
export class FunnelCounter {
  private readonly actors = new Map<string, Progress>();
  private readonly counts: number[];
  private readonly from: number;
  private readonly to: number;
  private readonly windowMs: number;
  private lastSeen?: { time: number; eventId: string };
  constructor(
    private readonly definition: FunnelDefinitionInput,
    private readonly range: FunnelRange,
  ) {
    this.from = Date.parse(range.from);
    this.to = Date.parse(range.to);
    this.windowMs = definition.windowMinutes * 60000;
    this.counts = definition.steps.map(() => 0);
  }
  consume(event: FunnelEvent): void {
    const time = event.occurredAt.getTime();
    if (
      this.lastSeen &&
      (time < this.lastSeen.time ||
        (time === this.lastSeen.time && event.eventId <= this.lastSeen.eventId))
    )
      throw new Error(
        'Funnel events must be ordered by occurrence and event ID',
      );
    this.lastSeen = { time, eventId: event.eventId };
    if (event.type !== 'track') return;
    const progress = this.actors.get(event.actor);
    if (!progress) {
      if (
        time < this.from ||
        time >= this.to ||
        !matches(this.definition.steps[0]!, event)
      )
        return;
      if (this.actors.size >= FUNNEL_LIMITS.actors)
        throw new FunnelTooLargeError('Narrow the date range for this path');
      this.actors.set(event.actor, {
        entryAt: time,
        lastAt: time,
        lastEventId: event.eventId,
        reached: 1,
      });
      this.counts[0]!++;
      return;
    }
    if (
      progress.reached >= this.definition.steps.length ||
      time > progress.entryAt + this.windowMs ||
      time < progress.lastAt ||
      (time === progress.lastAt && event.eventId <= progress.lastEventId)
    )
      return;
    if (!matches(this.definition.steps[progress.reached]!, event)) return;
    this.counts[progress.reached]!++;
    progress.reached++;
    progress.lastAt = time;
    progress.lastEventId = event.eventId;
  }
  result(funnelId: string, asOf = new Date()): FunnelResult {
    const entries = this.counts[0] ?? 0;
    return {
      funnelId,
      from: this.range.from,
      to: this.range.to,
      asOf: asOf.toISOString(),
      entries,
      windowMinutes: this.definition.windowMinutes,
      steps: this.definition.steps.map((step, index) => {
        const users = this.counts[index] ?? 0;
        const previous = this.counts[index - 1] ?? 0;
        return {
          step: index + 1,
          name: step.name,
          users,
          dropoff: index === 0 ? 0 : previous - users,
          rateFromStart: entries ? users / entries : 0,
          rateFromPrevious:
            index === 0 ? (entries ? 1 : 0) : previous ? users / previous : 0,
        };
      }),
    };
  }
}
