import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  validEventTime,
  type IngestionResult,
  type ingestionSchema,
} from '@eventlens/contracts';
import type { z } from 'zod';
import type { Prisma } from '@eventlens/database';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database.service.js';
import { ProjectRateLimiter } from './rate-limit.js';

@Injectable()
export class IngestionService {
  private readonly limiter = new ProjectRateLimiter();
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async accept(
    input: z.infer<typeof ingestionSchema>,
  ): Promise<IngestionResult> {
    const now = new Date();
    if (
      input.events.some(
        (event) => !validEventTime(event.occurredAt, now.getTime()),
      )
    )
      throw new BadRequestException(
        'Event timestamps must be within the last 30 days and no more than 5 minutes in the future',
      );
    const hash = createHash('sha256').update(input.projectKey).digest('hex');
    return this.db.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Project" WHERE "keyHash" = ${hash} FOR SHARE`;
      const project = rows[0];
      if (!project)
        throw new UnauthorizedException('Invalid public project key');
      this.limiter.consume(project.id, input.events.length);
      const unique = [
        ...new Map(
          input.events.map((event) => [event.eventId, event]),
        ).values(),
      ];
      const created = await tx.eventReceipt.createManyAndReturn({
        data: unique.map((event) => ({
          projectId: project.id,
          eventId: event.eventId,
          payload: event as unknown as Prisma.InputJsonValue,
          receivedAt: now,
        })),
        skipDuplicates: true,
        select: { id: true },
      });
      await tx.eventOutbox.createMany({
        data: created.map((row) => ({ receiptId: row.id })),
      });
      return {
        accepted: created.length,
        duplicates: input.events.length - created.length,
        receivedAt: now.toISOString(),
      };
    });
  }
}
