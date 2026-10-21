import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { acceptInvitationSchema, identifierSchema, invitationSchema } from '@eventlens/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { CurrentUser, SessionGuard, type AuthenticatedUser } from '../auth/session.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { parse } from '../http.js';
import { InvitationsService } from './invitations.service.js';

@Controller('v1/workspaces/:workspaceId/invitations')
@UseGuards(SessionGuard, OriginGuard)
export class InvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string) { return this.invitations.list(user.id, parse(identifierSchema, id)); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Body() body: unknown) { return this.invitations.create(user.id, parse(identifierSchema, id), parse(invitationSchema, body)); }
  @Delete(':invitationId') revoke(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') id: string, @Param('invitationId') invitationId: string) { return this.invitations.revoke(user.id, parse(identifierSchema, id), parse(identifierSchema, invitationId)); }
}

@Controller('v1/invitations')
@UseGuards(OriginGuard)
export class AcceptInvitationController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService, @Inject(AuthService) private readonly auth: AuthService) {}
  @Post('accept') async accept(@Body() body: unknown, @Req() request: Request) {
    const input = parse(acceptInvitationSchema, body);
    const session = await this.auth.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    return this.invitations.accept(input, session?.user);
  }
}
