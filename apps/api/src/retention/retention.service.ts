import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@eventlens/database';
import type { RetentionQuery, RetentionResult } from '@eventlens/contracts';
import { DatabaseService } from '../database.service.js';
import { AccessService } from '../workspaces/access.service.js';
import { canonicalActor } from '../analytics/query.js';
import { cohortTable, type RetentionRow } from './cohorts.js';

function propertyFilter(key?: string, value?: string): Prisma.Sql {
  return key === undefined || value === undefined
    ? Prisma.empty
    : Prisma.sql`AND jsonb_typeof("properties" -> ${key}::text)
      IN ('string', 'number', 'boolean') AND "properties" ->> ${key}::text = ${value}`;
}

@Injectable()
export class RetentionService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}
  async report(
    userId: string,
    workspaceId: string,
    projectId: string,
    query: RetentionQuery,
  ): Promise<RetentionResult> {
    await this.access.require(userId, workspaceId);
    const project = await this.db.client.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { timezone: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    const timezone = project.timezone;
    const asOf = new Date();
    const rows = await this.db.client.$queryRaw<RetentionRow[]>(Prisma.sql`
      WITH scoped AS MATERIALIZED (
        SELECT ${canonicalActor} AS actor, e."name", e."properties",
          (e."occurredAt" AT TIME ZONE ${timezone}::text)::date AS day
        FROM "AnalyticsEvent" e
        LEFT JOIN "IdentityLink" l ON l."projectId" = e."projectId"
          AND l."anonymousId" = e."anonymousId"
        WHERE e."projectId" = ${projectId}::uuid AND e."type" = 'track'
          AND e."name" IN (${query.entryEvent}, ${query.returnEvent})
          AND e."occurredAt" >= (${query.from}::date::timestamp AT TIME ZONE ${timezone}::text)
          AND e."occurredAt" < ((${query.to}::date + ${query.days}::int)::timestamp AT TIME ZONE ${timezone}::text)
      ), entries AS (
        SELECT actor, MIN(day) AS cohort FROM scoped
        WHERE "name" = ${query.entryEvent} AND day < ${query.to}::date
          ${propertyFilter(query.entryPropertyKey, query.entryPropertyValue)}
        GROUP BY actor
      ), returns AS (
        SELECT DISTINCT actor, day FROM scoped WHERE "name" = ${query.returnEvent}
          ${propertyFilter(query.returnPropertyKey, query.returnPropertyValue)}
      )
      SELECT TO_CHAR(cohort, 'YYYY-MM-DD') AS date, 0::int AS day,
        COUNT(*)::bigint AS users FROM entries GROUP BY cohort
      UNION ALL
      SELECT TO_CHAR(e.cohort, 'YYYY-MM-DD') AS date,
        (r.day - e.cohort)::int AS day, COUNT(*)::bigint AS users
      FROM entries e JOIN returns r ON r.actor = e.actor
        AND r.day > e.cohort AND r.day <= e.cohort + ${query.days}::int
      GROUP BY e.cohort, r.day
      ORDER BY date, day
    `);
    return {
      from: query.from,
      to: query.to,
      days: query.days,
      entryEvent: query.entryEvent,
      returnEvent: query.returnEvent,
      timezone,
      asOf: asOf.toISOString(),
      cohorts: cohortTable(query, rows, timezone, asOf),
    };
  }
}
