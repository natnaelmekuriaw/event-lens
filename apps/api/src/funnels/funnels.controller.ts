import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  funnelDefinitionSchema,
  funnelRangeSchema,
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
import { FunnelsService } from './funnels.service.js';

@ApiTags('conversion paths')
@ApiCookieAuth()
@Controller('v1/workspaces/:workspaceId/projects/:projectId/conversion-paths')
@UseGuards(SessionGuard, OriginGuard)
export class FunnelsController {
  constructor(
    @Inject(FunnelsService) private readonly funnels: FunnelsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List saved conversion paths for a project' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Query() query: unknown,
  ) {
    const page = parse(paginationSchema, query);
    return this.funnels.list(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      page.limit,
      page.cursor,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Save a conversion path (owner or admin)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Body() body: unknown,
  ) {
    return this.funnels.create(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(funnelDefinitionSchema, body),
    );
  }

  @Get(':pathId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Param('pathId') path: string,
  ) {
    return this.funnels.get(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(identifierSchema, path),
    );
  }

  @Put(':pathId')
  @ApiOperation({ summary: 'Replace a saved conversion path (owner or admin)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Param('pathId') path: string,
    @Body() body: unknown,
  ) {
    return this.funnels.update(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(identifierSchema, path),
      parse(funnelDefinitionSchema, body),
    );
  }

  @Delete(':pathId')
  @ApiOperation({ summary: 'Delete a saved conversion path (owner or admin)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Param('pathId') path: string,
  ) {
    return this.funnels.remove(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(identifierSchema, path),
    );
  }

  @Get(':pathId/results')
  @ApiOperation({
    summary: 'Count ordered conversion steps for distinct actors',
  })
  results(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspace: string,
    @Param('projectId') project: string,
    @Param('pathId') path: string,
    @Query() query: unknown,
  ) {
    return this.funnels.results(
      user.id,
      parse(identifierSchema, workspace),
      parse(identifierSchema, project),
      parse(identifierSchema, path),
      parse(funnelRangeSchema, query),
    );
  }
}
