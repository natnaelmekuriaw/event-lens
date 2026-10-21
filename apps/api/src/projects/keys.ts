import { createHash, randomBytes } from 'node:crypto';

export function hashKey(key: string): string { return createHash('sha256').update(key).digest('hex'); }
export function createProjectKey() {
  const key = `el_pk_${randomBytes(32).toString('base64url')}`;
  return { key, keyHash: hashKey(key), keyPrefix: key.slice(0, 14) };
}
