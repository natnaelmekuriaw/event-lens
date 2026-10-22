import {
  type ArgumentsHost,
  Catch,
  HttpException,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpException(
      {
        code: 'INVALID_INPUT',
        message: result.error.issues
          .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
          .join('; '),
      },
      400,
    );
  return result.data;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const parserStatus =
      error &&
      typeof error === 'object' &&
      'status' in error &&
      [400, 413].includes(Number(error.status))
        ? Number(error.status)
        : null;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : (parserStatus ?? 500);
    const body = error instanceof HttpException ? error.getResponse() : null;
    const detail =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)
        : {};
    response
      .status(status)
      .json({
        code: detail.code ?? `HTTP_${status}`,
        message:
          status >= 500
            ? 'The request could not be completed'
            : (detail.message ??
              (parserStatus === 413
                ? 'Request body is too large'
                : parserStatus === 400
                  ? 'Invalid JSON body'
                  : String(body))),
        requestId: response.getHeader('x-request-id'),
      });
  }
}
