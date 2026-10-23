import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@eventlens/database';
import type {
  ActivityQuery,
  AnalyticsOverview,
  AnalyticsQuery,
  Page,
  StoredEvent,
} from '@eventlens/contracts';
import { DatabaseService } from '../database.service.js';
import { AccessService } from '../workspaces/access.service.js';
import {
  activityActorFilter,
  canonicalActor,
  eventSelection,
} from './query.js';
import { bucketDates } from './buckets.js';

interface CountRow {
  totalEvents: bigint;
  activeUsers: bigint;
}
interface SeriesRow {
  date: string;
  events: bigint;
  activeUsers: bigint;
}
interface TopRow {
  name: string;
  count: bigint;
}
interface EventRow {
  id: string;
  projectId: string;
  eventId: string;
  type: string;
  name: string;
  anonymousId: string;
  userId: string | null;
  properties: unknown;
  occurredAt: Date;
  receivedAt: Date;
  identityConflict: boolean;
}
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}
  private async timezone(
    userId: string,
    workspaceId: string,
    projectId: string,
  ) {
    await this.access.require(userId, workspaceId);
    const project = await this.db.client.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { timezone: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project.timezone;
  }
  async overview(
    userId: string,
    workspaceId: string,
    projectId: string,
    query: AnalyticsQuery,
  ): Promise<AnalyticsOverview> {
    const timezone = await this.timezone(userId, workspaceId, projectId);
    const selected = eventSelection(projectId, query, true);
    const [summary, series, top] = await this.db.client.$transaction(
      async (tx) => {
        const [summary] = await tx.$queryRaw<CountRow[]>(
          Prisma.sql`SELECT COUNT(*)::bigint AS "totalEvents",
            COUNT(DISTINCT ${canonicalActor})::bigint AS "activeUsers"
            ${selected}`,
        );
        const series = await tx.$queryRaw<SeriesRow[]>(
          Prisma.sql`SELECT
            TO_CHAR(
              DATE_TRUNC(${query.bucket}::text, e."occurredAt" AT TIME ZONE ${timezone}::text),
              'YYYY-MM-DD'
            ) AS "date",
            COUNT(*)::bigint AS "events",
            COUNT(DISTINCT ${canonicalActor})::bigint AS "activeUsers"
            ${selected}
            GROUP BY 1 ORDER BY 1`,
        );
        const top = await tx.$queryRaw<TopRow[]>(
          Prisma.sql`SELECT e."name", COUNT(*)::bigint AS "count"
            ${selected}
            GROUP BY e."name"
            ORDER BY "count" DESC, e."name" ASC
            LIMIT 10`,
        );
        return [summary, series, top] as const;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
      },
    );
    const byDate = new Map(series.map((row) => [row.date, row]));
    return {
      from: query.from,
      to: query.to,
      timezone,
      bucket: query.bucket,
      totalEvents: Number(summary?.totalEvents ?? 0),
      activeUsers: Number(summary?.activeUsers ?? 0),
      series: bucketDates(query.from, query.to, timezone, query.bucket).map(
        (date) => ({
          date,
          events: Number(byDate.get(date)?.events ?? 0),
          activeUsers: Number(byDate.get(date)?.activeUsers ?? 0),
        }),
      ),
      topEvents: top.map((row) => ({
        name: row.name,
        count: Number(row.count),
      })),
    };
  }
  async activity(
    userId: string,
    workspaceId: string,
    projectId: string,
    query: ActivityQuery,
  ): Promise<Page<StoredEvent>> {
    await this.timezone(userId, workspaceId, projectId);
    const selected = eventSelection(projectId, query, false);
    const actor = activityActorFilter(query);
    let cursor: { id: string; occurredAt: Date } | undefined;
    if (query.cursor) {
      const [found] = await this.db.client.$queryRaw<
        { id: string; occurredAt: Date }[]
      >(
        Prisma.sql`SELECT e."id", e."occurredAt"
          ${selected} ${actor}
          AND e."id" = ${query.cursor}::uuid`,
      );
      if (!found) throw new NotFoundException('Activity cursor not found');
      cursor = found;
    }
    const rows = await this.db.client.$queryRaw<EventRow[]>(
      Prisma.sql`SELECT e.*
        ${selected} ${actor}
        ${
          cursor
            ? Prisma.sql`AND (e."occurredAt", e."id") <
                (${cursor.occurredAt}::timestamptz, ${cursor.id}::uuid)`
            : Prisma.empty
        }
        ORDER BY e."occurredAt" DESC, e."id" DESC
        LIMIT ${query.limit + 1}`,
    );
    return {
      items: rows.slice(0, query.limit).map((row) => ({
        ...row,
        type: row.type as StoredEvent['type'],
        properties: row.properties as StoredEvent['properties'],
        occurredAt: row.occurredAt.toISOString(),
        receivedAt: row.receivedAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1]!.id : null,
    };
  }
}
