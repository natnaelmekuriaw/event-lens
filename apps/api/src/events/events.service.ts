import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@eventlens/database';
import type {
  EventQuery,
  StoredEvent,
  ProcessingSummary,
  Page,
  FailedReceipt,
} from '@eventlens/contracts';
import { DatabaseService } from '../database.service.js';
import { AccessService } from '../workspaces/access.service.js';

@Injectable()
export class EventsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}
  private async requireProject(
    userId: string,
    workspaceId: string,
    projectId: string,
  ) {
    await this.access.require(userId, workspaceId);
    if (
      !(await this.db.client.project.findFirst({
        where: { id: projectId, workspaceId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Project not found');
  }
  async list(
    userId: string,
    workspaceId: string,
    projectId: string,
    query: EventQuery,
  ): Promise<Page<StoredEvent>> {
    await this.requireProject(userId, workspaceId, projectId);
    const cursor = query.cursor
      ? await this.db.client.analyticsEvent.findFirst({
          where: { id: query.cursor, projectId },
        })
      : null;
    if (query.cursor && !cursor)
      throw new NotFoundException('Event cursor not found');
    const rows = await this.db.client.analyticsEvent.findMany({
      where: {
        projectId,
        ...(query.name ? { name: query.name } : {}),
        ...(query.actor
          ? { OR: [{ userId: query.actor }, { anonymousId: query.actor }] }
          : {}),
        occurredAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
        ...(cursor
          ? {
              AND: [
                {
                  OR: [
                    { occurredAt: { lt: cursor.occurredAt } },
                    { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return {
      items: rows.slice(0, query.limit).map(serialize),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1]!.id : null,
    };
  }
  async get(
    userId: string,
    workspaceId: string,
    projectId: string,
    id: string,
  ) {
    await this.requireProject(userId, workspaceId, projectId);
    const row = await this.db.client.analyticsEvent.findFirst({
      where: { id, projectId },
    });
    if (!row) throw new NotFoundException('Event not found');
    return serialize(row);
  }
  async summary(
    userId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ProcessingSummary> {
    await this.requireProject(userId, workspaceId, projectId);
    const rows = await this.db.client.eventReceipt.groupBy({
      by: ['status'],
      where: { projectId },
      _count: true,
    });
    const result: ProcessingSummary = {
      pending: 0,
      processed: 0,
      failed: 0,
      expired: 0,
    };
    for (const row of rows) result[row.status] = row._count;
    return result;
  }
  async failures(
    userId: string,
    workspaceId: string,
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<FailedReceipt>> {
    await this.requireProject(userId, workspaceId, projectId);
    await this.access.require(userId, workspaceId, ['owner', 'admin']);
    const rows = await this.db.client.eventReceipt.findMany({
      where: {
        projectId,
        status: 'failed',
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        eventId: true,
        attempts: true,
        receivedAt: true,
        errorCode: true,
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      items: rows
        .slice(0, limit)
        .map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() })),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }
  async replay(
    userId: string,
    workspaceId: string,
    projectId: string,
    receiptId: string,
  ) {
    return this.access.mutate(
      userId,
      workspaceId,
      ['owner', 'admin'],
      async (tx) => {
        if (
          !(await tx.project.findFirst({
            where: { id: projectId, workspaceId },
          }))
        )
          throw new NotFoundException('Project not found');
        await tx.$queryRaw`SELECT id FROM "EventReceipt" WHERE id = ${receiptId}::uuid AND "projectId" = ${projectId}::uuid FOR UPDATE`;
        const row = await tx.eventReceipt.findFirst({
          where: { id: receiptId, projectId },
        });
        if (!row) throw new NotFoundException('Receipt not found');
        if (row.status !== 'failed' || row.payload === null)
          throw new BadRequestException(
            'Only failed receipts with retained payloads can be replayed',
          );
        await tx.eventReceipt.update({
          where: { id: row.id },
          data: {
            status: 'pending',
            generation: { increment: 1 },
            attempts: 0,
            failedAt: null,
            errorCode: null,
          },
        });
        await tx.eventOutbox.upsert({
          where: { receiptId: row.id },
          create: { receiptId: row.id },
          update: { nextDispatchAt: new Date() },
        });
        return { status: 'pending' };
      },
    );
  }
}
function serialize(row: Prisma.AnalyticsEventGetPayload<object>): StoredEvent {
  return {
    ...row,
    type: row.type as StoredEvent['type'],
    properties: row.properties as StoredEvent['properties'],
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
  };
}
