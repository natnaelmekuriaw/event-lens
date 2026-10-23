import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@eventlens/database';
import {
  funnelDefinitionSchema,
  type FunnelDefinitionInput,
  type FunnelRange,
  type FunnelResult,
  type Page,
  type SavedFunnel,
} from '@eventlens/contracts';
import { DatabaseService } from '../database.service.js';
import { AccessService } from '../workspaces/access.service.js';
import { FunnelTooLargeError } from './counter.js';
import { runFunnel } from './runner.js';

interface PathRow {
  id: string;
  projectId: string;
  name: string;
  steps: unknown;
  windowMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}
const serialize = (row: PathRow): SavedFunnel => {
  const definition = funnelDefinitionSchema.parse({
    name: row.name,
    steps: row.steps,
    windowMinutes: row.windowMinutes,
  });
  return {
    ...definition,
    id: row.id,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

@Injectable()
export class FunnelsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  private async requireProject(
    workspaceId: string,
    projectId: string,
    tx: Prisma.TransactionClient = this.db.client,
  ) {
    const project = await tx.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async find(projectId: string, id: string) {
    const [row] = await this.db.client.$queryRaw<PathRow[]>(
      Prisma.sql`SELECT * FROM "ConversionPath"
        WHERE "projectId" = ${projectId}::uuid AND "id" = ${id}::uuid`,
    );
    if (!row) throw new NotFoundException('Conversion path not found');
    return row;
  }

  async list(
    userId: string,
    workspaceId: string,
    projectId: string,
    limit: number,
    cursor?: string,
  ): Promise<Page<SavedFunnel>> {
    await this.access.require(userId, workspaceId);
    await this.requireProject(workspaceId, projectId);
    const cursorRow = cursor ? await this.find(projectId, cursor) : undefined;
    const rows = await this.db.client.$queryRaw<PathRow[]>(
      Prisma.sql`SELECT * FROM "ConversionPath" WHERE "projectId" = ${projectId}::uuid
        ${
          cursorRow
            ? Prisma.sql`AND ("createdAt", "id") <
          (${cursorRow.createdAt}::timestamptz, ${cursorRow.id}::uuid)`
            : Prisma.empty
        }
        ORDER BY "createdAt" DESC, "id" DESC LIMIT ${limit + 1}`,
    );
    return {
      items: rows.slice(0, limit).map(serialize),
      nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
  }

  async get(
    userId: string,
    workspaceId: string,
    projectId: string,
    id: string,
  ) {
    await this.access.require(userId, workspaceId);
    await this.requireProject(workspaceId, projectId);
    return serialize(await this.find(projectId, id));
  }

  async create(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: FunnelDefinitionInput,
  ): Promise<SavedFunnel> {
    return this.access.mutate(
      userId,
      workspaceId,
      ['owner', 'admin'],
      async (tx) => {
        await this.requireProject(workspaceId, projectId, tx);
        const [duplicate] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT "id" FROM "ConversionPath"
          WHERE "projectId" = ${projectId}::uuid AND "name" = ${input.name}`,
        );
        if (duplicate)
          throw new ConflictException('Conversion path name already exists');
        const [row] = await tx.$queryRaw<PathRow[]>(
          Prisma.sql`INSERT INTO "ConversionPath"
          ("id", "projectId", "name", "steps", "windowMinutes", "createdAt", "updatedAt")
          VALUES (${randomUUID()}::uuid, ${projectId}::uuid, ${input.name},
            ${JSON.stringify(input.steps)}::jsonb, ${input.windowMinutes}, NOW(), NOW())
          RETURNING *`,
        );
        return serialize(row!);
      },
    );
  }

  async update(
    userId: string,
    workspaceId: string,
    projectId: string,
    id: string,
    input: FunnelDefinitionInput,
  ): Promise<SavedFunnel> {
    return this.access.mutate(
      userId,
      workspaceId,
      ['owner', 'admin'],
      async (tx) => {
        await this.requireProject(workspaceId, projectId, tx);
        const [duplicate] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT "id" FROM "ConversionPath" WHERE "projectId" = ${projectId}::uuid
          AND "name" = ${input.name} AND "id" <> ${id}::uuid`,
        );
        if (duplicate)
          throw new ConflictException('Conversion path name already exists');
        const [row] = await tx.$queryRaw<PathRow[]>(
          Prisma.sql`UPDATE "ConversionPath" SET "name" = ${input.name},
          "steps" = ${JSON.stringify(input.steps)}::jsonb,
          "windowMinutes" = ${input.windowMinutes}, "updatedAt" = NOW()
          WHERE "id" = ${id}::uuid AND "projectId" = ${projectId}::uuid RETURNING *`,
        );
        if (!row) throw new NotFoundException('Conversion path not found');
        return serialize(row);
      },
    );
  }

  async remove(
    userId: string,
    workspaceId: string,
    projectId: string,
    id: string,
  ) {
    return this.access.mutate(
      userId,
      workspaceId,
      ['owner', 'admin'],
      async (tx) => {
        await this.requireProject(workspaceId, projectId, tx);
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`DELETE FROM "ConversionPath" WHERE "id" = ${id}::uuid
          AND "projectId" = ${projectId}::uuid RETURNING "id"`,
        );
        if (!rows.length)
          throw new NotFoundException('Conversion path not found');
        return { deleted: true };
      },
    );
  }

  async results(
    userId: string,
    workspaceId: string,
    projectId: string,
    id: string,
    range: FunnelRange,
  ): Promise<FunnelResult> {
    const definition = await this.get(userId, workspaceId, projectId, id);
    try {
      return await runFunnel(this.db.client, id, projectId, definition, range);
    } catch (error) {
      if (error instanceof FunnelTooLargeError)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }
  }
}
