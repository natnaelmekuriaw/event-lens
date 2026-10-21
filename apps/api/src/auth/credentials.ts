import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import type { Prisma } from '@eventlens/database';

export async function createCredentialUser(tx: Prisma.TransactionClient, input: { name: string; email: string }, passwordHash: string) {
  const id = randomUUID();
  return tx.user.create({ data: {
    id, name: input.name, email: input.email,
    accounts: { create: { id: randomUUID(), accountId: id, providerId: 'credential', password: passwordHash } },
  } });
}

export { hashPassword };
