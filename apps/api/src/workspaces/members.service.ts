import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Member, Role } from '@eventlens/contracts';
import { DatabaseService } from '../database.service.js';
import { AccessService } from './access.service.js';

@Injectable()
export class MembersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}
  async list(userId: string, workspaceId: string): Promise<Member[]> {
    await this.access.require(userId, workspaceId, ['owner', 'admin']);
    const rows = await this.db.client.membership.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { userId: 'asc' },
    });
    return rows.map(({ user, role }) => ({
      userId: user.id,
      name: user.name,
      email: user.email,
      role,
    }));
  }
  async change(
    userId: string,
    workspaceId: string,
    targetId: string,
    role: Role | null,
  ) {
    return this.access.mutate(userId, workspaceId, ['owner'], async (tx) => {
      const target = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetId } },
      });
      if (!target) throw new NotFoundException('Member not found');
      if (
        target.role === 'owner' &&
        role !== 'owner' &&
        (await tx.membership.count({
          where: { workspaceId, role: 'owner' },
        })) <= 1
      )
        throw new ConflictException(
          'A workspace must retain at least one owner',
        );
      const where = { workspaceId_userId: { workspaceId, userId: targetId } };
      if (role === null) await tx.membership.delete({ where });
      else await tx.membership.update({ where, data: { role } });
      return { success: true };
    });
  }
}
