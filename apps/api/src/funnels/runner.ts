import { Prisma, type PrismaClient } from '@eventlens/database';
import type {
  FunnelDefinitionInput,
  FunnelRange,
  FunnelResult,
} from '@eventlens/contracts';
import { canonicalActor } from '../analytics/query.js';
import { FunnelCounter, type FunnelEvent } from './counter.js';

interface EventRow extends Omit<FunnelEvent, 'properties'> {
  properties: unknown;
}
const PAGE_SIZE = 1000;
export async function runFunnel(
  db: PrismaClient,
  id: string,
  projectId: string,
  definition: FunnelDefinitionInput,
  range: FunnelRange,
): Promise<FunnelResult> {
  const counter = new FunnelCounter(definition, range);
  const names = [...new Set(definition.steps.map((step) => step.name))];
  const asOf = new Date();
  let cursor: { time: Date; eventId: string } | undefined;
  for (;;) {
    const rows = await db.$queryRaw<EventRow[]>(
      Prisma.sql`SELECT
        ${canonicalActor} AS "actor",
        e."eventId",
        e."type",
        e."name",
        e."properties",
        e."occurredAt"
      FROM "AnalyticsEvent" e
      LEFT JOIN "IdentityLink" l
        ON l."projectId" = e."projectId"
        AND l."anonymousId" = e."anonymousId"
      LEFT JOIN "EventReceipt" r ON r."id" = e."id"
      WHERE e."projectId" = ${projectId}::uuid
        AND e."type" = 'track'
        AND e."name" IN (${Prisma.join(names)})
        AND e."occurredAt" >= ${range.from}::timestamptz
        AND e."occurredAt" <= (
          ${range.to}::timestamptz +
          ${definition.windowMinutes}::int * INTERVAL '1 minute'
        )
        AND COALESCE(r."processedAt", e."receivedAt") <= ${asOf}::timestamptz
        ${
          cursor
            ? Prisma.sql`AND (e."occurredAt", e."eventId") >
                (${cursor.time}::timestamptz, ${cursor.eventId}::uuid)`
            : Prisma.empty
        }
      ORDER BY e."occurredAt" ASC, e."eventId" ASC
      LIMIT ${PAGE_SIZE}`,
    );
    for (const row of rows)
      counter.consume({
        ...row,
        properties: row.properties as FunnelEvent['properties'],
      });
    if (rows.length < PAGE_SIZE) break;
    const last = rows.at(-1)!;
    cursor = { time: last.occurredAt, eventId: last.eventId };
  }
  return counter.result(id, asOf);
}
