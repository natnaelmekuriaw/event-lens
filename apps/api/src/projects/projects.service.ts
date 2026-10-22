import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Page, Project } from '@eventlens/contracts';
import { DatabaseService } from '../database.service.js';
import { AccessService } from '../workspaces/access.service.js';
import { createProjectKey } from './keys.js';

const select = {
  id: true,
  workspaceId: true,
  name: true,
  timezone: true,
  keyPrefix: true,
  createdAt: true,
} as const;
const serialize = (
  row: Omit<Project, 'createdAt'> & { createdAt: Date },
): Project => ({ ...row, createdAt: row.createdAt.toISOString() });

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}
  async list(
    userId: string,
    workspaceId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<Project>> {
    await this.access.require(userId, workspaceId);
    const rows = await this.db.client.project.findMany({
      where: { workspaceId, ...(cursor ? { id: { gt: cursor } } : {}) },
      select,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return {
      items: rows.slice(0, limit).map(serialize),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }
  async create(
    userId: string,
    workspaceId: string,
    input: { name: string; timezone: string },
  ) {
    const { key, keyHash, keyPrefix } = createProjectKey();
    return this.access.mutate(
      userId,
      workspaceId,
      ['owner', 'admin'],
      async (tx) => {
        const row = await tx.project.create({
          data: { ...input, workspaceId, keyHash, keyPrefix },
          select,
        });
        return { project: serialize(row), key };
      },
    );
  }
  async get(userId: string, workspaceId: string, projectId: string) {
    await this.access.require(userId, workspaceId);
    const row = await this.db.client.project.findFirst({
      where: { id: projectId, workspaceId },
      select,
    });
    if (!row) throw new NotFoundException('Project not found');
    return serialize(row);
  }
  async update(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: { name: string; timezone: string },
  ) {
    return this.access.mutate(
      userId,
      workspaceId,
      ['owner', 'admin'],
      async (tx) => {
        const result = await tx.project.updateMany({
          where: { id: projectId, workspaceId },
          data: input,
        });
        if (!result.count) throw new NotFoundException('Project not found');
        return serialize(
          await tx.project.findFirstOrThrow({
            where: { id: projectId, workspaceId },
            select,
          }),
        );
      },
    );
  }
  async rotateKey(userId: string, workspaceId: string, projectId: string) {
    return this.access.mutate(
      userId,
      workspaceId,
      ['owner', 'admin'],
      async (tx) => {
        const { key, keyHash, keyPrefix } = createProjectKey();
        const result = await tx.project.updateMany({
          where: { id: projectId, workspaceId },
          data: { keyHash, keyPrefix },
        });
        if (!result.count) throw new NotFoundException('Project not found');
        return { key, keyPrefix };
      },
    );
  }
}
