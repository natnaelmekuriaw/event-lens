import { expect, it } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createAbuseLimiter } from '../../apps/api/src/security.js';

it('bounds mutation requests, expires counters, and ignores spoofed forwarding headers', () => {
  let now = 1000;
  let allowed = 0;
  let status = 0;
  const limiter = createAbuseLimiter({ limit: 2, now: () => now });
  const req = {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
  } as Request;
  const res = {
    setHeader() {},
    status(value: number) {
      status = value;
      return this;
    },
    json() {},
  } as unknown as Response;
  const next: NextFunction = () => {
    allowed++;
  };
  limiter(req, res, next);
  limiter(req, res, next);
  req.headers['x-forwarded-for'] = '192.0.2.1';
  limiter(req, res, next);
  expect(allowed).toBe(2);
  expect(status).toBe(429);
  now += 60001;
  limiter(req, res, next);
  expect(allowed).toBe(3);
});
