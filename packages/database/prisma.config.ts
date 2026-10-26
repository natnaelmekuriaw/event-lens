import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

if (process.env.TEST_DATABASE_ISOLATED !== '1')
  config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://eventlens:local@localhost:5432/eventlens',
  },
});
