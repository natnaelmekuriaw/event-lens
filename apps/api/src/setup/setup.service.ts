import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { setupSchema } from '@eventlens/contracts';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import { CONFIG, type Config } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { createCredentialUser, hashPassword } from '../auth/credentials.js';

@Injectable()
export class SetupService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(CONFIG) private readonly config: Config) {}
  async status() { return { required: (await this.db.client.installation.findUnique({ where: { id: 'eventlens' } })) === null }; }
  async initialize(input: z.infer<typeof setupSchema>) {
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(input.token), digest(this.config.BOOTSTRAP_TOKEN))) throw new ForbiddenException('Invalid setup token');
    const passwordHash = await hashPassword(input.password);
    return this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(734239)::text`;
      if (await tx.installation.findUnique({ where: { id: 'eventlens' } })) throw new ConflictException('Owner setup is already complete');
      const user = await createCredentialUser(tx, input, passwordHash);
      const workspace = await tx.workspace.create({ data: { name: input.workspaceName, memberships: { create: { userId: user.id, role: 'owner' } } } });
      await tx.installation.create({ data: { id: 'eventlens' } });
      return { workspaceId: workspace.id };
    });
  }
}
