import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { createApp } from '../../apps/api/src/server.js';
import type { PrismaClient } from '@eventlens/database';
import { DatabaseService } from '../../apps/api/src/database.service.js';

interface Fixture {
  app: Awaited<ReturnType<typeof createApp>>;
  base: string;
  ownerCookie: string;
  workspaceId: string;
  viewerEmail: string;
}
export function defineAnalyticsCases(fixture: () => Fixture) {
  describe('analytics against isolated PostgreSQL', () => {
    let db: PrismaClient;
    let state: Fixture;
    let projectId: string;
    let projectKey: string;
    let otherProjectId: string;
    let viewerCookie: string;
    let firstId: string;
    const anonymousId = 'analytics-anonymous';
    const from = '2026-03-07T05:00:00Z';
    const to = '2026-03-10T04:00:00Z';
    const path = () =>
      `/v1/workspaces/${state.workspaceId}/projects/${projectId}/analytics`;
    const query = (extra: Record<string, string> = {}) =>
      new URLSearchParams({ from, to, ...extra }).toString();
    function request(
      route: string,
      method = 'GET',
      cookie = state.ownerCookie,
    ) {
      return fetch(`${state.base}/api${route}`, {
        method,
        headers: {
          Origin: process.env.APP_URL!,
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
    }
    async function insert(data: {
      time: string;
      name: string;
      userId?: string;
      conflict?: boolean;
      type?: string;
      platform?: string;
      project?: string;
    }) {
      const id = randomUUID();
      await db.analyticsEvent.create({
        data: {
          id,
          projectId: data.project ?? projectId,
          eventId: randomUUID(),
          type: data.type ?? 'track',
          name: data.name,
          anonymousId,
          userId: data.userId,
          identityConflict: data.conflict ?? false,
          properties: { platform: data.platform ?? 'browser' },
          occurredAt: new Date(data.time),
          receivedAt: new Date(data.time),
        },
      });
      return id;
    }
    beforeAll(async () => {
      if (process.env.TEST_DATABASE_ISOLATED !== '1')
        throw new Error('Run pnpm verify for isolated analytics fixtures');
      state = fixture();
      db = state.app.get(DatabaseService).client;
      const project = await fetch(
        `${state.base}/api/v1/workspaces/${state.workspaceId}/projects`,
        {
          method: 'POST',
          headers: {
            Cookie: state.ownerCookie,
            Origin: process.env.APP_URL!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Analytics calendar',
            timezone: 'America/New_York',
          }),
        },
      );
      expect(project.status).toBe(201);
      const projectData = await project.json();
      projectId = projectData.project.id;
      projectKey = projectData.key;
      const another = await fetch(
        `${state.base}/api/v1/workspaces/${state.workspaceId}/projects`,
        {
          method: 'POST',
          headers: {
            Cookie: state.ownerCookie,
            Origin: process.env.APP_URL!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Other analytics project' }),
        },
      );
      expect(another.status).toBe(201);
      otherProjectId = (await another.json()).project.id;
      await db.identityLink.create({
        data: { projectId, anonymousId, userId: 'user-one' },
      });
      firstId = await insert({
        time: '2026-03-07T06:00:00Z',
        name: 'game_started',
      });
      await insert({
        time: '2026-03-08T06:30:00Z',
        name: 'level_completed',
        userId: 'user-one',
      });
      await insert({
        time: '2026-03-08T07:30:00Z',
        name: 'level_completed',
        userId: 'user-two',
        conflict: true,
        platform: 'desktop',
      });
      await insert({
        time: '2026-03-08T08:00:00Z',
        name: 'identify',
        type: 'identify',
        userId: 'user-one',
      });
      await insert({
        time: '2026-03-08T08:30:00Z',
        name: 'foreign_event',
        project: otherProjectId,
      });
      const viewer = await fetch(`${state.base}/api/auth/sign-in/email`, {
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
      expect(viewer.status).toBe(200);
      viewerCookie = viewer.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
    });
    it('counts linked users, conflicts, and empty local calendar buckets', async () => {
      const response = await request(
        `${path()}/overview?${query()}`,
        'GET',
        viewerCookie,
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        timezone: 'America/New_York',
        bucket: 'day',
        totalEvents: 3,
        activeUsers: 2,
        series: [
          { date: '2026-03-07', events: 1, activeUsers: 1 },
          { date: '2026-03-08', events: 2, activeUsers: 2 },
          { date: '2026-03-09', events: 0, activeUsers: 0 },
        ],
        topEvents: [
          { name: 'level_completed', count: 2 },
          { name: 'game_started', count: 1 },
        ],
      });
      expect(
        data.series.reduce(
          (count: number, bucket: { events: number }) => count + bucket.events,
          0,
        ),
      ).toBe(data.totalEvents);
    });
    it('filters exact names and top-level scalar properties', async () => {
      const browser = await request(
        `${path()}/overview?${query({
          propertyKey: 'platform',
          propertyValue: 'browser',
        })}`,
      );
      expect(await browser.json()).toMatchObject({
        totalEvents: 2,
        activeUsers: 1,
      });
      const named = await request(
        `${path()}/overview?${query({ name: 'level_completed' })}`,
      );
      expect(await named.json()).toMatchObject({
        totalEvents: 2,
        activeUsers: 2,
      });
      expect(
        (
          await request(
            `${path()}/overview?${query({ propertyKey: 'platform' })}`,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await request(
            `${path()}/overview?${query({
              to: '2027-04-01T00:00:00Z',
            })}`,
          )
        ).status,
      ).toBe(400);
    });
    it('uses Monday weeks and project-local months', async () => {
      const weekly = await request(
        `${path()}/overview?${query({ bucket: 'week' })}`,
      );
      expect((await weekly.json()).series).toEqual([
        { date: '2026-03-02', events: 3, activeUsers: 2 },
        { date: '2026-03-09', events: 0, activeUsers: 0 },
      ]);
      const monthly = await request(
        `${path()}/overview?${query({ bucket: 'month' })}`,
      );
      expect((await monthly.json()).series).toEqual([
        { date: '2026-03-01', events: 3, activeUsers: 2 },
      ]);
    });
    it('pages linked activity and separates conflicting user activity', async () => {
      const first = await request(
        `${path()}/activity?${query({
          actorType: 'user',
          actorId: 'user-one',
          limit: '1',
        })}`,
      );
      expect(first.status).toBe(200);
      const page = await first.json();
      expect(page.items).toHaveLength(1);
      expect(page.items[0].type).toBe('identify');
      expect(page.nextCursor).toBeTruthy();
      const next = await request(
        `${path()}/activity?${query({
          actorType: 'user',
          actorId: 'user-one',
          limit: '1',
          cursor: page.nextCursor,
        })}`,
      );
      expect((await next.json()).items[0].name).toBe('level_completed');
      const userTwo = await request(
        `${path()}/activity?${query({
          actorType: 'user',
          actorId: 'user-two',
        })}`,
      );
      expect((await userTwo.json()).items).toHaveLength(1);
      const anonymous = await request(
        `${path()}/activity?${query({
          actorType: 'anonymous',
          actorId: anonymousId,
        })}`,
      );
      expect((await anonymous.json()).items).toHaveLength(4);
      const old = await request(
        `${path()}/activity?${query({
          actorType: 'user',
          actorId: 'user-one',
          name: 'game_started',
        })}`,
      );
      expect((await old.json()).items[0].id).toBe(firstId);
    });
    it('requires membership and never treats a public key as read access', async () => {
      expect(
        (await request(`${path()}/overview?${query()}`, 'GET', '')).status,
      ).toBe(401);
      const publicKey = await fetch(
        `${state.base}/api${path()}/overview?${query()}`,
        { headers: { Authorization: `Bearer ${projectKey}` } },
      );
      expect(publicKey.status).toBe(401);
      const wrongProject = `/v1/workspaces/${state.workspaceId}/projects/${otherProjectId}/analytics`;
      const other = await request(`${wrongProject}/overview?${query()}`);
      expect((await other.json()).totalEvents).toBe(1);
      const wrongWorkspace = `/v1/workspaces/${randomUUID()}/projects/${projectId}/analytics`;
      expect(
        (await request(`${wrongWorkspace}/overview?${query()}`)).status,
      ).toBe(404);
    });
  });
}
