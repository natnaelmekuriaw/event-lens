import { Prisma } from '@eventlens/database';
import type { ActivityQuery, AnalyticsQuery } from '@eventlens/contracts';

type Filters = Pick<
  AnalyticsQuery,
  'from' | 'to' | 'name' | 'propertyKey' | 'propertyValue'
>;
export const canonicalActor = Prisma.sql`CASE
  WHEN e."identityConflict" AND e."userId" IS NOT NULL
    THEN 'u:' || e."userId"
  WHEN l."userId" IS NOT NULL THEN 'u:' || l."userId"
  WHEN e."userId" IS NOT NULL THEN 'u:' || e."userId"
  ELSE 'a:' || e."anonymousId"
END`;
export function eventSelection(
  projectId: string,
  query: Filters,
  trackOnly: boolean,
): Prisma.Sql {
  return Prisma.sql`
    FROM "AnalyticsEvent" e
    LEFT JOIN "IdentityLink" l
      ON l."projectId" = e."projectId"
      AND l."anonymousId" = e."anonymousId"
    WHERE e."projectId" = ${projectId}::uuid
      AND e."occurredAt" >= ${query.from}::timestamptz
      AND e."occurredAt" < ${query.to}::timestamptz
      ${trackOnly ? Prisma.sql`AND e."type" = 'track'` : Prisma.empty}
      ${query.name ? Prisma.sql`AND e."name" = ${query.name}` : Prisma.empty}
      ${
        query.propertyKey !== undefined && query.propertyValue !== undefined
          ? Prisma.sql`AND jsonb_typeof(e."properties" -> ${query.propertyKey}::text)
              IN ('string', 'number', 'boolean')
              AND e."properties" ->> ${query.propertyKey}::text = ${query.propertyValue}`
          : Prisma.empty
      }
  `;
}
export function activityActorFilter(query: ActivityQuery): Prisma.Sql {
  return query.actorType === 'user'
    ? Prisma.sql`AND ${canonicalActor} = ${'u:' + query.actorId}`
    : Prisma.sql`AND e."anonymousId" = ${query.actorId}`;
}
