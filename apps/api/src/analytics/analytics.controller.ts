import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  activityQuerySchema,
  analyticsQuerySchema,
  identifierSchema,
} from '@eventlens/contracts';
import {
  CurrentUser,
  SessionGuard,
  type AuthenticatedUser,
} from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { parse } from '../http.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('analytics')
@ApiCookieAuth()
@Controller('v1/workspaces/:workspaceId/projects/:projectId/analytics')
@UseGuards(SessionGuard, OriginGuard)
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}
  @Get('overview')
  @ApiOperation({
    summary: 'Event trends and distinct active users in project-local buckets',
  })
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Query() query: unknown,
  ) {
    return this.analytics.overview(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(analyticsQuerySchema, query),
    );
  }
  @Get('activity')
  @ApiOperation({
    summary: 'Filtered activity timeline for one user or anonymous ID',
  })
  activity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Query() query: unknown,
  ) {
    return this.analytics.activity(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(activityQuerySchema, query),
    );
  }
}
