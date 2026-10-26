import { passwordSchema } from '@eventlens/contracts';
import type { PrismaClient } from '@eventlens/database';
import { hashPassword } from './credentials.js';

export async function recoverAccount(
  db: PrismaClient,
  email: string,
  password: string,
) {
  passwordSchema.parse(password);
  const hash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) throw new Error('Existing credential account not found');
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const updated = await tx.account.updateMany({
      where: { userId: user.id, providerId: 'credential' },
      data: { password: hash },
    });
    if (updated.count !== 1)
      throw new Error('Existing credential account not found');
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
}
