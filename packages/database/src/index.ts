import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export { Prisma, PrismaClient } from './generated/client.js';

export function createDatabase(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 }) });
}
