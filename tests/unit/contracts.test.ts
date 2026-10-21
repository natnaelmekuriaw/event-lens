import { describe, expect, it } from 'vitest';
import { canManageProjects, createProjectSchema, paginationSchema, setupSchema } from '@eventlens/contracts';

describe('management contracts', () => {
  it('normalizes names and defaults reporting to UTC', () => { expect(createProjectSchema.parse({ name: ' GalaxyBalls ' })).toEqual({ name: 'GalaxyBalls', timezone: 'UTC' }); });
  it('rejects unknown fields, empty names, and invalid timezones', () => {
    for (const input of [{ name: '' }, { name: 'game', role: 'owner' }, { name: 'game', timezone: 'Nowhere/Invalid' }]) expect(createProjectSchema.safeParse(input).success).toBe(false);
  });
  it('bounds pagination', () => { expect(paginationSchema.parse({ limit: '20' }).limit).toBe(20); for (const limit of [0, 101, -1, 'all']) expect(paginationSchema.safeParse({ limit }).success).toBe(false); });
  it('requires an operator token and a strong owner password', () => { expect(setupSchema.safeParse({ token: 'short', name: 'Owner', email: 'owner@example.com', password: 'short', workspaceName: 'Team' }).success).toBe(false); });
  it('limits project writes to owners and admins', () => { expect(canManageProjects('owner')).toBe(true); expect(canManageProjects('admin')).toBe(true); expect(canManageProjects('viewer')).toBe(false); });
});
