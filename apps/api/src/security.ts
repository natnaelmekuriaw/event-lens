import { createHmac, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';

export function createAbuseLimiter(
  options: {
    limit?: number;
    windowMs?: number;
    capacity?: number;
    now?: () => number;
  } = {},
): RequestHandler {
  const {
    limit = 120,
    windowMs = 60000,
    capacity = 10000,
    now = Date.now,
  } = options;
  const secret = randomBytes(32);
  const counters = new Map<string, { count: number; expiresAt: number }>();
  return (request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      next();
      return;
    }
    const time = now();
    const key = createHmac('sha256', secret)
      .update(request.socket.remoteAddress ?? 'unknown')
      .digest('hex');
    let counter = counters.get(key);
    if (!counter || counter.expiresAt <= time) {
      for (const [id, value] of counters)
        if (value.expiresAt <= time) counters.delete(id);
      if (counters.size >= capacity && !counters.has(key)) {
        response.setHeader('Retry-After', '60');
        response
          .status(429)
          .json({
            code: 'RATE_LIMITED',
            message: 'Too many requests. Try again shortly.',
          });
        return;
      }
      counter = { count: 0, expiresAt: time + windowMs };
      counters.set(key, counter);
    }
    counter.count++;
    if (counter.count > limit) {
      response.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((counter.expiresAt - time) / 1000))),
      );
      response
        .status(429)
        .json({
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again shortly.',
        });
      return;
    }
    next();
  };
}
