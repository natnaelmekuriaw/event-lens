import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@eventlens/database';
import type { createApp } from '../../apps/api/src/server.js';
import { DatabaseService } from '../../apps/api/src/database.service.js';

interface Fixture {
  app: Awaited<ReturnType<typeof createApp>>;
  base: string;
  ownerCookie: string;
  workspaceId: string;
  otherWorkspaceId: string;
  viewerEmail: string;
}
export function defineConversionPathCases(fixture: () => Fixture) {
  describe('conversion paths against isolated PostgreSQL', () => {
    let state: Fixture;
    let db: PrismaClient;
    let projectId: string;
    let otherProjectId: string;
    let publicKey: string;
    let viewerCookie: string;
    let pathId: string;
    const from = new Date(Date.now() - 86400000).toISOString();
    const at = (minute: number) =>
      new Date(Date.parse(from) + minute * 60000).toISOString();
    const to = at(15);
    const definition = {
      name: 'Onboarding',
      steps: [
        { name: 'game_started' },
        {
          name: 'level_completed',
          propertyKey: 'platform',
          propertyValue: 'browser',
        },
        { name: 'purchase_completed' },
      ],
      windowMinutes: 60,
    };
    const route = () =>
      `/v1/workspaces/${state.workspaceId}/projects/${projectId}/conversion-paths`;
    async function request(
      path: string,
      method = 'GET',
      body?: unknown,
      cookie = state.ownerCookie,
    ) {
      return fetch(`${state.base}/api${path}`, {
        method,
        headers: {
          Origin: process.env.APP_URL!,
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function event(
      anonymousId: string,
      name: string,
      time: string,
      platform = 'browser',
      project = projectId,
    ) {
      const id = randomUUID();
      await db.analyticsEvent.create({
        data: {
          id,
          projectId: project,
          eventId: randomUUID(),
          type: 'track',
          name,
          anonymousId,
          properties: { platform },
          occurredAt: new Date(time),
          receivedAt: new Date(time),
        },
      });
    }
    beforeAll(async () => {
      if (process.env.TEST_DATABASE_ISOLATED !== '1')
        throw new Error(
          'Run pnpm verify for isolated conversion path fixtures',
        );
      state = fixture();
      db = state.app.get(DatabaseService).client;
      const created = await request(
        `/v1/workspaces/${state.workspaceId}/projects`,
        'POST',
        { name: 'Conversion path cases' },
      );
      expect(created.status).toBe(201);
      const data = await created.json();
      projectId = data.project.id;
      publicKey = data.key;
      const other = await request(
        `/v1/workspaces/${state.workspaceId}/projects`,
        'POST',
        { name: 'Unrelated conversion project' },
      );
      expect(other.status).toBe(201);
      otherProjectId = (await other.json()).project.id;
      const signIn = await request(
        '/auth/sign-in/email',
        'POST',
        {
          email: state.viewerEmail,
          password: process.env.TEST_OWNER_PASSWORD,
        },
        '',
      );
      expect(signIn.status).toBe(200);
      viewerCookie = signIn.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      await db.identityLink.createMany({
        data: [
          { projectId, anonymousId: 'path-one-a', userId: 'path-user-one' },
          { projectId, anonymousId: 'path-one-b', userId: 'path-user-one' },
        ],
      });
      await event('path-one-a', 'game_started', at(5));
      await event('path-one-b', 'level_completed', at(10));
      await event('path-one-b', 'purchase_completed', at(20));
      await event('path-two', 'game_started', at(6));
      await event('path-two', 'level_completed', at(12), 'desktop');
      await event('path-three', 'game_started', at(7));
      await event('path-three', 'level_completed', at(68));
      await event('foreign', 'game_started', at(8), 'browser', otherProjectId);
    });
    it('validates and saves definitions with owner permissions', async () => {
      expect(
        (
          await request(route(), 'POST', {
            ...definition,
            steps: [{ name: 'one' }],
          })
        ).status,
      ).toBe(400);
      expect(
        (await request(route(), 'POST', definition, viewerCookie)).status,
      ).toBe(403);
      const response = await request(route(), 'POST', definition);
      expect(response.status).toBe(201);
      const saved = await response.json();
      pathId = saved.id;
      expect(saved).toMatchObject(definition);
      expect((await request(route(), 'POST', definition)).status).toBe(409);
    });
    it('lists and reads as a viewer without exposing another project', async () => {
      const listed = await request(
        `${route()}?limit=1`,
        'GET',
        undefined,
        viewerCookie,
      );
      expect(listed.status).toBe(200);
      expect((await listed.json()).items[0].id).toBe(pathId);
      expect(
        (await request(`${route()}/${pathId}`, 'GET', undefined, viewerCookie))
          .status,
      ).toBe(200);
      expect(
        (
          await request(
            `/v1/workspaces/${state.workspaceId}/projects/${otherProjectId}/conversion-paths/${pathId}`,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await request(
            `/v1/workspaces/${state.otherWorkspaceId}/projects/${projectId}/conversion-paths`,
          )
        ).status,
      ).toBe(404);
      const publicResponse = await fetch(`${state.base}/api${route()}`, {
        headers: { Authorization: `Bearer ${publicKey}` },
      });
      expect(publicResponse.status).toBe(401);
    });
    it('counts canonical people, ordered steps, filters, and later completion', async () => {
      const query = new URLSearchParams({ from, to });
      const response = await request(
        `${route()}/${pathId}/results?${query}`,
        'GET',
        undefined,
        viewerCookie,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        entries: 3,
        steps: [
          { users: 3, dropoff: 0, rateFromStart: 1 },
          { users: 1, dropoff: 2, rateFromStart: 1 / 3 },
          { users: 1, dropoff: 0, rateFromStart: 1 / 3, rateFromPrevious: 1 },
        ],
      });
      expect(
        (await request(`${route()}/${pathId}/results?from=${from}&to=${from}`))
          .status,
      ).toBe(400);
    });
    it('updates and deletes saved paths with role checks', async () => {
      const changed = {
        ...definition,
        name: 'Onboarding revised',
        windowMinutes: 30,
      };
      expect(
        (await request(`${route()}/${pathId}`, 'PUT', changed, viewerCookie))
          .status,
      ).toBe(403);
      const response = await request(`${route()}/${pathId}`, 'PUT', changed);
      expect(response.status).toBe(200);
      expect((await response.json()).name).toBe(changed.name);
      expect(
        (
          await request(
            `${route()}/${pathId}`,
            'DELETE',
            undefined,
            viewerCookie,
          )
        ).status,
      ).toBe(403);
      expect((await request(`${route()}/${pathId}`, 'DELETE')).status).toBe(
        200,
      );
      expect((await request(`${route()}/${pathId}`)).status).toBe(404);
    });
  });
}
