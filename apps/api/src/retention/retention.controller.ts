import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { identifierSchema, retentionQuerySchema } from '@eventlens/contracts';
import {
  CurrentUser,
  SessionGuard,
  type AuthenticatedUser,
} from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { parse } from '../http.js';
import { RetentionService } from './retention.service.js';

@ApiTags('retention')
@ApiCookieAuth()
@Controller('v1/workspaces/:workspaceId/projects/:projectId/retention')
@UseGuards(SessionGuard, OriginGuard)
export class RetentionController {
  constructor(
    @Inject(RetentionService) private readonly retention: RetentionService,
  ) {}
  @Get()
  @ApiOperation({
    summary: 'Exact-day retention by project-local entry cohort',
  })
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Query() query: unknown,
  ) {
    return this.retention.report(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(retentionQuerySchema, query),
    );
  }
}
