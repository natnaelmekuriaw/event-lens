import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { createApp } from '../../apps/api/src/server.js';
import { DatabaseService } from '../../apps/api/src/database.service.js';

interface Fixture {
  app: Awaited<ReturnType<typeof createApp>>;
  base: string;
  workspaceId: string;
  otherWorkspaceId: string;
  ownerCookie: string;
  viewerEmail: string;
}
export function defineRetentionCases(fixture: () => Fixture) {
  describe('daily cohort retention against isolated PostgreSQL', () => {
    let state: Fixture;
    let projectId: string;
    let otherProjectId: string;
    let publicKey: string;
    let viewer: string;
    const query = {
      from: '2026-03-07',
      to: '2026-03-10',
      entryEvent: 'entered',
      returnEvent: 'returned',
      days: '3',
    };
    const route = () =>
      `/v1/workspaces/${state.workspaceId}/projects/${projectId}/retention`;
    function request(path: string, cookie = state.ownerCookie) {
      return fetch(`${state.base}/api${path}`, { headers: { Cookie: cookie } });
    }
    async function report(extra: Record<string, string> = {}) {
      const response = await request(
        `${route()}?${new URLSearchParams({ ...query, ...extra })}`,
        viewer,
      );
      expect(response.status, await response.clone().text()).toBe(200);
      return response.json();
    }
    beforeAll(async () => {
      if (process.env.TEST_DATABASE_ISOLATED !== '1')
        throw new Error('Run pnpm verify for isolated retention fixtures');
      state = fixture();
      async function project(name: string) {
        const response = await fetch(
          `${state.base}/api/v1/workspaces/${state.workspaceId}/projects`,
          {
            method: 'POST',
            headers: {
              Cookie: state.ownerCookie,
              Origin: process.env.APP_URL!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, timezone: 'America/New_York' }),
          },
        );
        expect(response.status).toBe(201);
        return response.json();
      }
      const created = await project('Retention calendar');
      projectId = created.project.id;
      publicKey = created.key;
      otherProjectId = (await project('Other retention')).project.id;
      const signedIn = await fetch(`${state.base}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          Origin: process.env.APP_URL!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: state.viewerEmail,
          password: process.env.TEST_OWNER_PASSWORD,
        }),
      });
      expect(signedIn.status).toBe(200);
      viewer = signedIn.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
      const db = state.app.get(DatabaseService).client;
      await db.identityLink.createMany({
        data: [
          { projectId, anonymousId: 'retention-a', userId: 'retention-user' },
          { projectId, anonymousId: 'retention-b', userId: 'retention-user' },
        ],
      });
      async function insert(
        actor: string,
        name: string,
        time: string,
        platform = 'browser',
        conflict = false,
        project = projectId,
      ) {
        await db.analyticsEvent.create({
          data: {
            id: randomUUID(),
            eventId: randomUUID(),
            projectId: project,
            type: 'track',
            name,
            anonymousId: actor,
            ...(conflict
              ? { userId: 'different-user', identityConflict: true }
              : {}),
            properties: { platform, plan: 'pro', level: 2, active: true },
            occurredAt: new Date(time),
            receivedAt: new Date(),
          },
        });
      }
      await insert('retention-a', 'entered', '2026-03-08T04:30:00Z'); // March 7 local
      await insert('retention-b', 'entered', '2026-03-08T08:00:00Z'); // does not reassign cohort
      await insert('retention-b', 'returned', '2026-03-08T07:30:00Z'); // March 8 after DST jump
      await insert('retention-b', 'returned', '2026-03-08T08:30:00Z');
      await insert('second', 'entered', '2026-03-07T15:00:00Z', 'desktop');
      await insert('second', 'returned', '2026-03-09T14:00:00Z');
      await insert('third', 'entered', '2026-03-08T06:30:00Z');
      await insert('third', 'returned', '2026-03-09T13:00:00Z');
      await insert(
        'retention-a',
        'entered',
        '2026-03-07T16:00:00Z',
        'desktop',
        true,
      );
      await insert(
        'retention-a',
        'returned',
        '2026-03-09T14:00:00Z',
        'browser',
        true,
      );
      await insert(
        'foreign',
        'entered',
        '2026-03-07T15:00:00Z',
        'browser',
        false,
        otherProjectId,
      );
      await insert(
        'foreign',
        'returned',
        '2026-03-08T15:00:00Z',
        'browser',
        false,
        otherProjectId,
      );
    });
    it('matches the hand-counted exact-day cohorts across DST and identity links', async () => {
      const data = await report();
      expect(data.timezone).toBe('America/New_York');
      expect(
        data.cohorts.map((cohort: { size: number }) => cohort.size),
      ).toEqual([3, 1, 0]);
      expect(
        data.cohorts[0].cells.map((cell: { users: number }) => cell.users),
      ).toEqual([3, 1, 2, 0]);
      expect(data.cohorts[0].cells[1].rate).toBe(1 / 3);
      expect(
        data.cohorts[1].cells.map((cell: { users: number }) => cell.users),
      ).toEqual([1, 1, 0, 0]);
      const narrow = await report({ to: '2026-03-08' });
      expect(narrow.cohorts).toHaveLength(1);
      expect(
        narrow.cohorts[0].cells.map((cell: { users: number }) => cell.users),
      ).toEqual([3, 1, 2, 0]);
    });
    it('applies entry and return filters independently while preserving the denominator', async () => {
      const entry = await report({
        entryPropertyKey: 'platform',
        entryPropertyValue: 'browser',
      });
      expect(entry.cohorts[0].size).toBe(1);
      expect(entry.cohorts[0].cells[1].users).toBe(1);
      const noReturns = await report({
        returnPropertyKey: 'plan',
        returnPropertyValue: 'free',
      });
      expect(noReturns.cohorts[0].size).toBe(3);
      expect(
        noReturns.cohorts[0].cells.map((cell: { users: number }) => cell.users),
      ).toEqual([3, 0, 0, 0]);
      const scalars = await report({
        entryPropertyKey: 'level',
        entryPropertyValue: '2',
        returnPropertyKey: 'active',
        returnPropertyValue: 'true',
      });
      expect(
        scalars.cohorts[0].cells.map((cell: { users: number }) => cell.users),
      ).toEqual([3, 1, 2, 0]);
    });
    it('returns unavailable future cells and validates bounds', async () => {
      const data = await report({ from: '2099-01-01', to: '2099-01-02' });
      expect(
        data.cohorts[0].cells.every(
          (cell: { users: number | null; rate: number | null }) =>
            cell.users === null && cell.rate === null,
        ),
      ).toBe(true);
      for (const extra of [
        { days: '31' },
        { entryPropertyKey: 'plan' },
        { from: '2026-02-30' },
      ]) {
        expect(
          (
            await request(
              `${route()}?${new URLSearchParams({ ...query, ...extra })}`,
            )
          ).status,
        ).toBe(400);
      }
    });
    it('rejects public keys and mismatched workspace or project scopes', async () => {
      const suffix = `?${new URLSearchParams(query)}`;
      expect((await request(route() + suffix, '')).status).toBe(401);
      expect(
        (
          await fetch(`${state.base}/api${route()}${suffix}`, {
            headers: { Authorization: `Bearer ${publicKey}` },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await request(
            `/v1/workspaces/${state.otherWorkspaceId}/projects/${projectId}/retention${suffix}`,
          )
        ).status,
      ).toBe(404);
      const other = await request(
        `/v1/workspaces/${state.workspaceId}/projects/${otherProjectId}/retention${suffix}`,
      );
      expect(other.status).toBe(200);
      expect((await other.json()).cohorts[0].size).toBe(1);
    });
  });
}
