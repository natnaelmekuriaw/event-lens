import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createProjectSchema, identifierSchema, paginationSchema, updateProjectSchema } from '@eventlens/contracts';
import { CurrentUser, SessionGuard, type AuthenticatedUser } from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { parse } from '../http.js';
import { ProjectsService } from './projects.service.js';

@Controller('v1/workspaces/:workspaceId/projects')
@UseGuards(SessionGuard, OriginGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Query() query: unknown) {
    const pagination = parse(paginationSchema, query);
    return this.projects.list(user.id, parse(identifierSchema, id), pagination.limit, pagination.cursor);
  }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Body() body: unknown) { return this.projects.create(user.id, parse(identifierSchema, id), parse(createProjectSchema, body)); }
  @Get(':projectId') get(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Param('projectId') projectId: string) { return this.projects.get(user.id, parse(identifierSchema, id), parse(identifierSchema, projectId)); }
  @Patch(':projectId') update(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Param('projectId') projectId: string, @Body() body: unknown) { return this.projects.update(user.id, parse(identifierSchema, id), parse(identifierSchema, projectId), parse(updateProjectSchema, body)); }
  @Post(':projectId/keys/rotate') rotate(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Param('projectId') projectId: string) { return this.projects.rotateKey(user.id, parse(identifierSchema, id), parse(identifierSchema, projectId)); }
}
