import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';

export const logger = pino({
  level: 'info',
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'req.headers.cookie',
      'req.headers.authorization',
    ],
    censor: '[redacted]',
  },
});
export const httpLogger = pinoHttp({
  logger,
  genReqId(_req, res) {
    const id = randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        path: String(req.url).split('?')[0],
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
    err() {
      return { message: 'HTTP request failed' };
    },
  },
});
