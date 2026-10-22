import express from 'express';
import { EVENT_LIMITS } from '@eventlens/contracts';

export function ingestionHttp(): express.RequestHandler[] {
  return [
    (_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      next();
    },
    (req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      if (req.method === 'POST' && !req.is('application/json')) {
        res
          .status(415)
          .json({ code: 'JSON_REQUIRED', message: 'Use application/json' });
        return;
      }
      next();
    },
    express.json({ limit: EVENT_LIMITS.payloadBytes, strict: true }),
  ];
}
