import type { PrismaClient } from '@eventlens/database';
import type { Queue } from 'bullmq';
import { eventJobId, MAX_ATTEMPTS, type EventJob } from './queue.js';
import { recordFailure } from './processor.js';

export async function dispatchOutbox(
  db: PrismaClient,
  queue: Queue,
  now = new Date(),
): Promise<number> {
  const rows = await db.eventOutbox.findMany({
    where: { nextDispatchAt: { lte: now }, receipt: { status: 'pending' } },
    include: { receipt: { select: { generation: true } } },
    orderBy: [{ nextDispatchAt: 'asc' }, { receiptId: 'asc' }],
    take: 100,
  });
  for (const row of rows) {
    const data: EventJob = {
      receiptId: row.receiptId,
      generation: row.receipt.generation,
    };
    const id = eventJobId(data);
    const job = await queue.getJob(id);
    const state = await job?.getState();
    if (state === 'failed') {
      await recordFailure(db, data, job!.attemptsMade || MAX_ATTEMPTS, true);
      continue;
    }
    if (state === 'completed') await job!.remove();
    if (!job || state === 'completed')
      await queue.add('process-event', data, { jobId: id });
    await db.eventOutbox.updateMany({
      where: { receiptId: row.receiptId },
      data: { nextDispatchAt: new Date(now.getTime() + 30000) },
    });
  }
  return rows.length;
}
