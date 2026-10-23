import { defineEventPipelineCases } from './pipeline-cases.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../apps/api/src/server.js';
import { DatabaseService } from '../../apps/api/src/database.service.js';

let app: Awaited<ReturnType<typeof createApp>>;
let base: string;
let ownerCookie: string;
let viewerCookie: string;
let workspaceId: string;
let otherWorkspaceId: string;
let projectId: string;
let publicKey: string;
let ownerId: string;
let viewerEmail: string;

async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  origin = process.env.APP_URL!,
) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function signIn(email: string, password: string) {
  const response = await request('/auth/sign-in/email', 'POST', {
    email,
    password,
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

describe('management API against isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (process.env.TEST_DATABASE_ISOLATED !== '1')
      throw new Error('Run pnpm verify to create an isolated test database');
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const setup = {
      token: process.env.BOOTSTRAP_TOKEN,
      name: 'Test owner',
      email: process.env.TEST_OWNER_EMAIL,
      password: process.env.TEST_OWNER_PASSWORD,
      workspaceName: 'Test workspace',
    };
    const results = await Promise.all([
      request('/v1/setup', 'POST', setup),
      request('/v1/setup', 'POST', setup),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    workspaceId = (await results.find((r) => r.status === 201)!.json())
      .workspaceId;
    ownerCookie = await signIn(
      process.env.TEST_OWNER_EMAIL!,
      process.env.TEST_OWNER_PASSWORD!,
    );
    ownerId = (
      await (
        await request('/auth/get-session', 'GET', undefined, ownerCookie)
      ).json()
    ).user.id;
    otherWorkspaceId = (
      await (
        await request(
          '/v1/workspaces',
          'POST',
          { name: 'Another workspace' },
          ownerCookie,
        )
      ).json()
    ).id;
    const created = await request(
      `/v1/workspaces/${workspaceId}/projects`,
      'POST',
      { name: 'GalaxyBalls' },
      ownerCookie,
    );
    expect(created.status).toBe(201);
    const data = await created.json();
    projectId = data.project.id;
    publicKey = data.key;
    viewerEmail = `viewer-${randomUUID()}@example.com`;
    const invited = await request(
      `/v1/workspaces/${workspaceId}/invitations`,
      'POST',
      { email: viewerEmail, role: 'viewer' },
      ownerCookie,
    );
    const { token } = await invited.json();
    const accepts = await Promise.all([
      request('/v1/invitations/accept', 'POST', {
        token,
        name: 'Viewer',
        password: process.env.TEST_OWNER_PASSWORD,
      }),
      request('/v1/invitations/accept', 'POST', {
        token,
        name: 'Viewer',
        password: process.env.TEST_OWNER_PASSWORD,
      }),
    ]);
    expect(accepts.map((r) => r.status).sort()).toEqual([201, 404]);
    viewerCookie = await signIn(viewerEmail, process.env.TEST_OWNER_PASSWORD!);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it('closes setup after the first owner and keeps public signup disabled', async () => {
    expect(await (await request('/v1/setup')).json()).toEqual({
      required: false,
    });
    expect(
      (
        await request('/auth/sign-up/email', 'POST', {
          email: 'public@example.com',
          name: 'Public',
          password: process.env.TEST_OWNER_PASSWORD,
        })
      ).status,
    ).toBe(400);
  });
  it('requires sessions and rejects public project keys as management credentials', async () => {
    expect((await request('/v1/workspaces')).status).toBe(401);
    const result = await fetch(`${base}/api/v1/workspaces`, {
      headers: { Authorization: `Bearer ${publicKey}` },
    });
    expect(result.status).toBe(401);
  });
  it('returns project metadata without credential hashes', async () => {
    const response = await request(
      `/v1/workspaces/${workspaceId}/projects`,
      'GET',
      undefined,
      viewerCookie,
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items[0].name).toBe('GalaxyBalls');
    expect(data.items[0]).not.toHaveProperty('keyHash');
    expect(data.items[0]).not.toHaveProperty('key');
  });
  it('rejects viewer writes and cross-workspace reads', async () => {
    expect(
      (
        await request(
          `/v1/workspaces/${workspaceId}/projects`,
          'POST',
          { name: 'Forbidden' },
          viewerCookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/v1/workspaces/${otherWorkspaceId}/projects`,
          'GET',
          undefined,
          viewerCookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/v1/workspaces/${otherWorkspaceId}/projects/${projectId}`,
          'GET',
          undefined,
          ownerCookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/v1/workspaces/${workspaceId}/projects/${projectId}/keys/rotate`,
          'POST',
          undefined,
          viewerCookie,
        )
      ).status,
    ).toBe(403);
  });
  it('requires a trusted origin on mutations', async () => {
    expect(
      (
        await request(
          '/v1/workspaces',
          'POST',
          { name: 'Bad origin' },
          ownerCookie,
          'https://untrusted.example.com',
        )
      ).status,
    ).toBe(403);
  });
  it('preserves the last owner', async () => {
    expect(
      (
        await request(
          `/v1/workspaces/${workspaceId}/members/${ownerId}`,
          'PATCH',
          { role: 'viewer' },
          ownerCookie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/v1/workspaces/${workspaceId}/members/${ownerId}`,
          'DELETE',
          undefined,
          ownerCookie,
        )
      ).status,
    ).toBe(409);
  });
  it('rotates keys and removes the old credential digest', async () => {
    const db = app.get(DatabaseService).client;
    const previous = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const response = await request(
      `/v1/workspaces/${workspaceId}/projects/${projectId}/keys/rotate`,
      'POST',
      undefined,
      ownerCookie,
    );
    expect(response.status).toBe(201);
    const data = await response.json();
    const next = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(data.key).not.toBe(publicKey);
    expect(next.keyHash).not.toBe(previous.keyHash);
    expect(next.keyHash).not.toBe(data.key);
  });
  it('does not allow an invitation to replace an existing account password', async () => {
    const response = await request(
      `/v1/workspaces/${otherWorkspaceId}/invitations`,
      'POST',
      { email: viewerEmail, role: 'admin' },
      ownerCookie,
    );
    expect(response.status).toBe(201);
    const { token } = await response.json();
    const replacement = {
      token,
      name: 'Impersonator',
      password: 'a-different-password-123',
    };
    expect(
      (await request('/v1/invitations/accept', 'POST', replacement)).status,
    ).toBe(401);
    const stillValid = await signIn(
      viewerEmail,
      process.env.TEST_OWNER_PASSWORD!,
    );
    expect(stillValid).not.toBe('');
    expect(
      (
        await request(
          '/v1/invitations/accept',
          'POST',
          { token, name: 'Viewer' },
          viewerCookie,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          '/v1/invitations/accept',
          'POST',
          { token, name: 'Viewer' },
          viewerCookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/v1/workspaces/${workspaceId}/invitations`,
          'GET',
          undefined,
          viewerCookie,
        )
      ).status,
    ).toBe(403);
  });
  it('omits IP and browser metadata from persistent sessions', async () => {
    const rows = await app.get(DatabaseService).client.session.findMany();
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((row) => row.ipAddress === null && row.userAgent === null),
    ).toBe(true);
  });
  it('invalidates a session on sign out', async () => {
    const result = await request('/auth/sign-out', 'POST', {}, viewerCookie);
    expect(result.status).toBe(200);
    expect(
      (await request('/v1/workspaces', 'GET', undefined, viewerCookie)).status,
    ).toBe(401);
  });
  defineEventPipelineCases(() => ({
    app,
    base,
    ownerCookie,
    workspaceId,
    viewerEmail,
  }));
});
