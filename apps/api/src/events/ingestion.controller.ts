import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ingestionSchema } from '@eventlens/contracts';
import { parse } from '../http.js';
import { IngestionService } from './ingestion.service.js';

@ApiTags('ingestion')
@Controller('v1/ingest')
export class IngestionController {
  constructor(
    @Inject(IngestionService) private readonly ingestion: IngestionService,
  ) {}
  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Durably accept an event batch with a public project key',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['projectKey', 'events'],
      properties: {
        projectKey: { type: 'string' },
        events: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          items: {
            type: 'object',
            required: ['eventId', 'type', 'name', 'occurredAt', 'anonymousId'],
            properties: {
              eventId: { type: 'string', format: 'uuid' },
              type: { type: 'string', enum: ['track', 'identify'] },
              name: { type: 'string', maxLength: 100 },
              occurredAt: { type: 'string', format: 'date-time' },
              anonymousId: { type: 'string' },
              userId: { type: 'string' },
              properties: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description:
      'New receipts and pending work committed to PostgreSQL. Processing is asynchronous.',
  })
  @ApiResponse({
    status: 400,
    description: 'The entire batch is invalid; nothing accepted.',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  accept(@Body() body: unknown) {
    return this.ingestion.accept(parse(ingestionSchema, body));
  }
}
