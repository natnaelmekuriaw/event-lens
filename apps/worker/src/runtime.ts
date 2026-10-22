import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { createDatabase } from '@eventlens/database';
import {
  cleanupEvents,
  dispatchOutbox,
  eventQueue,
  MAX_ATTEMPTS,
  processReceipt,
  QUEUE_NAME,
  recordFailure,
  redisConnection,
  type EventJob,
} from '@eventlens/pipeline';
import { Worker } from 'bullmq';
import pino from 'pino';

const logger = pino({ base: { service: 'worker' } });
@Injectable()
export class WorkerRuntime implements OnModuleInit, OnModuleDestroy {
  readonly db;
  readonly queue;
  private worker?: Worker<EventJob>;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopping = false;
  private current: Promise<void> = Promise.resolve();
  private cleanupAt = 0;
  private lastDispatchAt = 0;
  readonly retentionDays: number;
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    this.retentionDays = Number(process.env.EVENT_RETENTION_DAYS ?? 90);
    if (
      !Number.isInteger(this.retentionDays) ||
      this.retentionDays < 7 ||
      this.retentionDays > 3650
    )
      throw new Error('EVENT_RETENTION_DAYS must be 7–3650');
    this.db = createDatabase(process.env.DATABASE_URL);
    this.queue = eventQueue(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.queue.on('error', () =>
      logger.warn(
        { code: 'QUEUE_UNAVAILABLE' },
        'Queue connection unavailable',
      ),
    );
  }
  async onModuleInit() {
    this.worker = new Worker<EventJob>(
      QUEUE_NAME,
      async (job) => {
        try {
          await processReceipt(this.db, job.data);
        } catch {
          await recordFailure(
            this.db,
            job.data,
            job.attemptsMade + 1,
            job.attemptsMade + 1 >= MAX_ATTEMPTS,
          );
          throw new Error('PROCESSING_FAILED');
        }
      },
      {
        connection: redisConnection(
          process.env.REDIS_URL ?? 'redis://localhost:6379',
          true,
        ),
        concurrency: 8,
        maxStalledCount: 2,
      },
    );
    this.worker.on('error', () =>
      logger.warn(
        { code: 'WORKER_CONNECTION' },
        'Worker connection unavailable',
      ),
    );
    this.worker.on('failed', (job) =>
      logger.warn(
        { receiptId: job?.data.receiptId, code: 'PROCESSING_FAILED' },
        'Event processing attempt failed',
      ),
    );
    this.timer = setInterval(() => {
      if (!this.running) this.current = this.tick();
    }, 1000);
    this.current = this.tick();
  }
  private async tick(): Promise<void> {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const dispatched = await dispatchOutbox(this.db, this.queue);
      this.lastDispatchAt = Date.now();
      if (dispatched) logger.info({ dispatched }, 'Dispatched event receipts');
      if (Date.now() >= this.cleanupAt) {
        const result = await cleanupEvents(this.db, this.retentionDays);
        this.cleanupAt = Date.now() + 60000;
        if (result.deletedEvents || result.expiredFailures)
          logger.info(result, 'Applied event retention');
      }
    } catch {
      logger.warn(
        { code: 'DISPATCH_UNAVAILABLE' },
        'Outbox dispatch delayed; durable receipts remain pending',
      );
    } finally {
      this.running = false;
    }
  }
  async ready() {
    if (this.stopping || Date.now() - this.lastDispatchAt > 60000)
      throw new Error('DISPATCH_STALE');
    await this.db.$queryRaw`SELECT 1`;
    await this.queue.getJobCounts('waiting', 'active', 'failed');
    return { status: 'ok', database: 'ready', queue: 'ready' };
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.current;
    await this.worker?.close();
    await this.queue.close();
    await this.db.$disconnect();
  }
}
