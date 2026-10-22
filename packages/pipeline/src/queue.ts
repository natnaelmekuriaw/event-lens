import { Queue } from 'bullmq';
export const QUEUE_NAME = 'eventlens-events';
export function queuePrefix(): string {
  const value = process.env.EVENTLENS_QUEUE_PREFIX ?? 'eventlens';
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new Error('Invalid EVENTLENS_QUEUE_PREFIX');
  return value;
}
export const MAX_ATTEMPTS = 5;
export function redisConnection(url: string, blocking = false) {
  const parsed = new URL(url);
  if (!['redis:', 'rediss:'].includes(parsed.protocol))
    throw new Error('REDIS_URL must use redis or rediss');
  const db = Number(parsed.pathname.slice(1) || 0);
  if (!Number.isInteger(db) || db < 0)
    throw new Error('Invalid Redis database');
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    db,
    ...(parsed.username
      ? { username: decodeURIComponent(parsed.username) }
      : {}),
    ...(parsed.password
      ? { password: decodeURIComponent(parsed.password) }
      : {}),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: blocking ? null : 1,
    connectTimeout: 5000,
  };
}
export function eventQueue(redisUrl: string) {
  return new Queue(QUEUE_NAME, {
    prefix: queuePrefix(),
    connection: redisConnection(redisUrl),
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 3600, count: 10000 },
      removeOnFail: { age: 86400, count: 10000 },
    },
  });
}
export interface EventJob {
  receiptId: string;
  generation: number;
}
export function eventJobId(data: EventJob) {
  return data.receiptId + '-' + data.generation;
}
