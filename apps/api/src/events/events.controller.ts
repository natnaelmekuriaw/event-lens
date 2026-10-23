import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  eventQuerySchema,
  identifierSchema,
  paginationSchema,
} from '@eventlens/contracts';
import {
  CurrentUser,
  SessionGuard,
  type AuthenticatedUser,
} from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { parse } from '../http.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@ApiCookieAuth()
@Controller('v1/workspaces/:workspaceId/projects/:projectId')
@UseGuards(SessionGuard, OriginGuard)
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}
  @Get('events')
  @ApiOperation({
    summary:
      'Explore project events, newest occurrence first; UTC inclusive bounds',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Query() query: unknown,
  ) {
    return this.events.list(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(eventQuerySchema, query),
    );
  }
  @Get('events/:eventId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Param('eventId') event: string,
  ) {
    return this.events.get(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(identifierSchema, event),
    );
  }
  @Get('processing')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
  ) {
    return this.events.summary(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
    );
  }
  @Get('processing/failures')
  failures(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Query() query: unknown,
  ) {
    const page = parse(paginationSchema, query);
    return this.events.failures(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      page.limit,
      page.cursor,
    );
  }
  @Post('processing/:receiptId/replay')
  @ApiOperation({
    summary:
      'Owner/admin replays a failed receipt using a new delivery generation',
  })
  replay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Param('receiptId') receipt: string,
  ) {
    return this.events.replay(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(identifierSchema, receipt),
    );
  }
}
