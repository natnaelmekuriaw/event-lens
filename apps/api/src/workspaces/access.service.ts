import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '@eventlens/contracts';
import type { Prisma } from '@eventlens/database';
import { DatabaseService } from '../database.service.js';

@Injectable()
export class AccessService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async require(
    userId: string,
    workspaceId: string,
    allowed?: readonly Role[],
    client: Prisma.TransactionClient = this.db.client,
  ) {
    const membership = await client.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    if (allowed && !allowed.includes(membership.role))
      throw new ForbiddenException(
        'Your workspace role does not allow this action',
      );
    return membership;
  }
  async mutate<T>(
    userId: string,
    workspaceId: string,
    allowed: readonly Role[],
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId}::uuid FOR UPDATE`;
      await this.require(userId, workspaceId, allowed, tx);
      return action(tx);
    });
  }
}
