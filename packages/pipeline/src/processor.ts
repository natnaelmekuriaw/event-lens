import { Prisma, type PrismaClient } from '@eventlens/database';
import { eventSchema } from '@eventlens/contracts';
import type { EventJob } from './queue.js';

export function identityConflict(
  linkedUser: string | undefined,
  suppliedUser: string | undefined,
): boolean {
  return Boolean(linkedUser && suppliedUser && linkedUser !== suppliedUser);
}
export async function processReceipt(
  db: PrismaClient,
  data: EventJob,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventReceipt" WHERE id = ${data.receiptId}::uuid FOR UPDATE`;
    const receipt = await tx.eventReceipt.findUnique({
      where: { id: data.receiptId },
    });
    if (
      !receipt ||
      receipt.status !== 'pending' ||
      receipt.generation !== data.generation
    )
      return;
    const event = eventSchema.parse(receipt.payload);
    let conflict = false;
    if (event.userId) {
      // The unique project/anonymous key serializes competing first associations.
      await tx.identityLink.createMany({
        data: [
          {
            projectId: receipt.projectId,
            anonymousId: event.anonymousId,
            userId: event.userId,
          },
        ],
        skipDuplicates: true,
      });
      const link = await tx.identityLink.findUniqueOrThrow({
        where: {
          projectId_anonymousId: {
            projectId: receipt.projectId,
            anonymousId: event.anonymousId,
          },
        },
      });
      conflict = identityConflict(link.userId, event.userId);
      if (!conflict)
        await tx.identityLink.update({
          where: {
            projectId_anonymousId: {
              projectId: receipt.projectId,
              anonymousId: event.anonymousId,
            },
          },
          data: { updatedAt: new Date() },
        });
    }
    await tx.analyticsEvent.createMany({
      data: [
        {
          id: receipt.id,
          projectId: receipt.projectId,
          eventId: receipt.eventId,
          type: event.type,
          name: event.name,
          anonymousId: event.anonymousId,
          userId: event.userId ?? null,
          properties: event.properties as Prisma.InputJsonValue,
          occurredAt: new Date(event.occurredAt),
          receivedAt: receipt.receivedAt,
          identityConflict: conflict,
        },
      ],
      skipDuplicates: true,
    });
    await tx.eventReceipt.update({
      where: { id: receipt.id },
      data: {
        status: 'processed',
        processedAt: new Date(),
        payload: Prisma.DbNull,
        errorCode: null,
      },
    });
    await tx.eventOutbox.deleteMany({ where: { receiptId: receipt.id } });
  });
}
export async function recordFailure(
  db: PrismaClient,
  data: EventJob,
  attempts: number,
  terminal: boolean,
): Promise<void> {
  await db.eventReceipt.updateMany({
    where: {
      id: data.receiptId,
      generation: data.generation,
      status: 'pending',
    },
    data: {
      attempts,
      errorCode: 'PROCESSING_FAILED',
      ...(terminal ? { status: 'failed', failedAt: new Date() } : {}),
    },
  });
}
