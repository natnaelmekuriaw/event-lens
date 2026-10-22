import { Prisma, type PrismaClient } from '@eventlens/database';

export async function cleanupEvents(
  db: PrismaClient,
  retentionDays: number,
  now = new Date(),
) {
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 7 ||
    retentionDays > 3650
  )
    throw new Error('Retention must be 7–3650 days');
  const cutoff = new Date(now.getTime() - retentionDays * 86400000);
  const failedCutoff = new Date(now.getTime() - 14 * 86400000);
  return db.$transaction(async (tx) => {
    const events = await tx.analyticsEvent.findMany({
      where: { receivedAt: { lt: cutoff } },
      select: { id: true },
      take: 1000,
    });
    const deleted = await tx.analyticsEvent.deleteMany({
      where: { id: { in: events.map((row) => row.id) } },
    });
    const failed = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "EventReceipt" WHERE status = 'failed' AND "failedAt" < ${failedCutoff} LIMIT 1000 FOR UPDATE SKIP LOCKED`;
    const ids = failed.map((row) => row.id);
    await tx.eventOutbox.deleteMany({ where: { receiptId: { in: ids } } });
    await tx.eventReceipt.updateMany({
      where: { id: { in: ids }, status: 'failed' },
      data: {
        status: 'expired',
        payload: Prisma.DbNull,
        errorCode: 'PAYLOAD_EXPIRED',
      },
    });
    await tx.$executeRaw`DELETE FROM "IdentityLink" WHERE ("projectId", "anonymousId") IN (SELECT l."projectId", l."anonymousId" FROM "IdentityLink" l WHERE l."updatedAt" < ${cutoff} AND NOT EXISTS (SELECT 1 FROM "AnalyticsEvent" e WHERE e."projectId" = l."projectId" AND e."anonymousId" = l."anonymousId") LIMIT 1000 FOR UPDATE OF l SKIP LOCKED)`;
    return { deletedEvents: deleted.count, expiredFailures: ids.length };
  });
}
