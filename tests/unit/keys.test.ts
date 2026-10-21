import { describe, expect, it } from 'vitest';
import { createProjectKey, hashKey } from '../../apps/api/src/projects/keys.js';

describe('public project keys', () => {
  it('keeps the raw value separate from its digest and display prefix', () => { const value = createProjectKey(); expect(value.key).toMatch(/^el_pk_[A-Za-z0-9_-]{43}$/); expect(value.keyHash).toBe(hashKey(value.key)); expect(value.keyHash).not.toContain(value.key); expect(value.keyPrefix).toBe(value.key.slice(0, 14)); expect(value.key).not.toBe(createProjectKey().key); });
});
