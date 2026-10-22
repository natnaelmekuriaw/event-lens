import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Workspace } from '@eventlens/contracts';
import { DatabaseService } from '../database.service.js';

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async list(userId: string): Promise<Workspace[]> {
    const rows = await this.db.client.membership.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { workspace: { createdAt: 'asc' } },
    });
    return rows.map(({ workspace, role }) => ({
      id: workspace.id,
      name: workspace.name,
      role,
      createdAt: workspace.createdAt.toISOString(),
    }));
  }
  async create(userId: string, name: string): Promise<Workspace> {
    const row = await this.db.client.workspace.create({
      data: { name, memberships: { create: { userId, role: 'owner' } } },
    });
    return {
      id: row.id,
      name: row.name,
      role: 'owner',
      createdAt: row.createdAt.toISOString(),
    };
  }
  async get(userId: string, workspaceId: string): Promise<Workspace> {
    const row = await this.db.client.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { workspace: true },
    });
    if (!row) throw new NotFoundException('Workspace not found');
    return {
      id: row.workspace.id,
      name: row.workspace.name,
      role: row.role,
      createdAt: row.workspace.createdAt.toISOString(),
    };
  }
}
