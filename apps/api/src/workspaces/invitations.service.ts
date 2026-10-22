import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Invitation } from '@eventlens/contracts';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database.service.js';
import { AccessService } from './access.service.js';
import { hashKey } from '../projects/keys.js';
import { createCredentialUser, hashPassword } from '../auth/credentials.js';
import type { AuthenticatedUser } from '../auth/session.guard.js';

const select = { id: true, email: true, role: true, expiresAt: true } as const;

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}
  async list(userId: string, workspaceId: string): Promise<Invitation[]> {
    await this.access.require(userId, workspaceId, ['owner']);
    const rows = await this.db.client.invitation.findMany({
      where: { workspaceId, expiresAt: { gt: new Date() } },
      select,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      ...row,
      expiresAt: row.expiresAt.toISOString(),
    }));
  }
  async create(
    userId: string,
    workspaceId: string,
    input: { email: string; role: 'admin' | 'viewer' },
  ) {
    return this.access.mutate(userId, workspaceId, ['owner'], async (tx) => {
      if (
        await tx.membership.findFirst({
          where: { workspaceId, user: { email: input.email } },
        })
      )
        throw new ConflictException('This account is already a member');
      const token = randomBytes(32).toString('base64url');
      const data = {
        ...input,
        tokenHash: hashKey(token),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      };
      const invitation = await tx.invitation.upsert({
        where: { workspaceId_email: { workspaceId, email: input.email } },
        create: { workspaceId, ...data },
        update: data,
        select,
      });
      return {
        invitation: {
          ...invitation,
          expiresAt: invitation.expiresAt.toISOString(),
        },
        token,
      };
    });
  }
  async revoke(userId: string, workspaceId: string, invitationId: string) {
    return this.access.mutate(userId, workspaceId, ['owner'], async (tx) => {
      const result = await tx.invitation.deleteMany({
        where: { id: invitationId, workspaceId },
      });
      if (!result.count) throw new NotFoundException('Invitation not found');
      return { success: true };
    });
  }
  async accept(
    input: { token: string; name: string; password?: string | undefined },
    signedInUser?: AuthenticatedUser,
  ) {
    const tokenHash = hashKey(input.token);
    const initial = await this.db.client.invitation.findUnique({
      where: { tokenHash },
      select: { workspaceId: true },
    });
    if (!initial)
      throw new NotFoundException('Invitation is invalid or expired');
    const passwordHash = input.password
      ? await hashPassword(input.password)
      : null;
    return this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${initial.workspaceId}::uuid FOR UPDATE`;
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash },
      });
      if (!invitation || invitation.expiresAt <= new Date())
        throw new NotFoundException('Invitation is invalid or expired');
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invitation.email}, 0))::text`;
      let user = await tx.user.findUnique({
        where: { email: invitation.email },
      });
      if (user) {
        if (signedInUser?.id !== user.id)
          throw new UnauthorizedException(
            'Sign in with the invited email, then reopen this invitation',
          );
      } else {
        if (!passwordHash)
          throw new BadRequestException(
            'A password is required for a new account',
          );
        user = await createCredentialUser(
          tx,
          { name: input.name, email: invitation.email },
          passwordHash,
        );
      }
      await tx.membership.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId: user.id,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: invitation.role,
        },
        update: {},
      });
      await tx.invitation.delete({ where: { id: invitation.id } });
      return { workspaceId: invitation.workspaceId, email: user.email };
    });
  }
}
