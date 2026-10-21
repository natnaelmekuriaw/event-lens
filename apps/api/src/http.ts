import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpException({ code: 'INVALID_INPUT', message: result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') }, 400);
  return result.data;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const detail = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
    response.status(status).json({ code: detail.code ?? `HTTP_${status}`, message: status >= 500 ? 'The request could not be completed' : detail.message ?? String(body), requestId: request.res.getHeader('x-request-id') });
  }
}
