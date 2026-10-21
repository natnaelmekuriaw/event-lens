import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { createWorkspaceSchema, identifierSchema } from '@eventlens/contracts';
import { CurrentUser, SessionGuard, type AuthenticatedUser } from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { parse } from '../http.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('v1/workspaces')
@UseGuards(SessionGuard, OriginGuard)
export class WorkspacesController {
  constructor(@Inject(WorkspacesService) private readonly workspaces: WorkspacesService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.workspaces.list(user.id); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.workspaces.create(user.id, parse(createWorkspaceSchema, body).name); }
  @Get(':workspaceId') get(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) { return this.workspaces.get(user.id, parse(identifierSchema, workspaceId)); }
}
