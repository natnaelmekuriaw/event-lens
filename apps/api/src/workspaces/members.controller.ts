import { Body, Controller, Delete, Get, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { changeRoleSchema, identifierSchema } from '@eventlens/contracts';
import { z } from 'zod';
import { CurrentUser, SessionGuard, type AuthenticatedUser } from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { parse } from '../http.js';
import { MembersService } from './members.service.js';

@Controller('v1/workspaces/:workspaceId/members')
@UseGuards(SessionGuard, OriginGuard)
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string) { return this.members.list(user.id, parse(identifierSchema, id)); }
  @Patch(':userId') change(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Param('userId') target: string, @Body() body: unknown) { return this.members.change(user.id, parse(identifierSchema, id), parse(z.string().min(1).max(128), target), parse(changeRoleSchema, body).role); }
  @Delete(':userId') remove(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Param('userId') target: string) { return this.members.change(user.id, parse(identifierSchema, id), parse(z.string().min(1).max(128), target), null); }
}
