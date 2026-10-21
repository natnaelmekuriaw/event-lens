import { z } from 'zod';

const localSecret = z.string().min(32).refine((value) => !value.startsWith('replace-with-'), 'Run pnpm setup or supply a random secret');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APP_URL: z.url(),
  API_URL: z.url(),
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
  BETTER_AUTH_SECRET: localSecret,
  BOOTSTRAP_TOKEN: localSecret,
});

export type Config = z.infer<typeof schema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  for (const field of ['APP_URL', 'API_URL'] as const) {
    const url = new URL(parsed.data[field]);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error(`${field} must be an HTTP origin without credentials, path, or query`);
    }
    if (parsed.data.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error(`${field} must use HTTPS in production`);
  }
  return parsed.data;
}

export const CONFIG = Symbol('CONFIG');
