import { describe, expect, it } from 'vitest';
import { readConfig } from '../../apps/api/src/config.js';

const env = { APP_URL: 'http://localhost:3000', API_URL: 'http://localhost:3001', DATABASE_URL: 'postgresql://local:password@localhost/eventlens', BETTER_AUTH_SECRET: 'a'.repeat(64), BOOTSTRAP_TOKEN: 'b'.repeat(64) };
describe('configuration', () => {
  it('normalizes origin trailing slashes', () => { expect(readConfig({ ...env, APP_URL: 'http://localhost:3000/' }).APP_URL).toBe('http://localhost:3000'); });
  it('accepts local development origins', () => { expect(readConfig(env).PORT).toBe(3001); });
  it('rejects production HTTP and malformed origins', () => { for (const APP_URL of ['http://public.example.com', 'https://public.example.com/path', 'https://user:pass@public.example.com']) expect(() => readConfig({ ...env, NODE_ENV: 'production', APP_URL })).toThrow(); });
  it('reports field names without exposing secret values', () => { expect(() => readConfig({ ...env, BETTER_AUTH_SECRET: 'private-value' })).toThrow('BETTER_AUTH_SECRET'); expect(() => readConfig({ ...env, BETTER_AUTH_SECRET: 'private-value' })).not.toThrow('private-value'); });
});
