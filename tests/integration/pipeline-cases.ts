import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { createApp } from '../../apps/api/src/server.js';
import type { TrackingEvent } from '@eventlens/contracts';
import type { PrismaClient } from '@eventlens/database';
import { DatabaseService } from '../../apps/api/src/database.service.js';
import { WorkerRuntime } from '../../apps/worker/src/runtime.js';
import {
  cleanupEvents,
  dispatchOutbox,
  eventJobId,
  eventQueue,
  MAX_ATTEMPTS,
  processReceipt,
  recordFailure,
  reserveReceiptAttempt,
} from '../../packages/pipeline/src/index.js';
import { createEventLens } from '../../packages/sdk/src/index.js';

interface ManagementFixture {
  app: Awaited<ReturnType<typeof createApp>>;
  base: string;
  ownerCookie: string;
  workspaceId: string;
  viewerEmail: string;
}

export function defineEventPipelineCases(fixture: () => ManagementFixture) {
  describe('event pipeline against isolated PostgreSQL and Redis', () => {
    let db: PrismaClient;
    let queue: ReturnType<typeof eventQueue>;
    let projectId: string;
    let projectKey: string;
    let viewerCookie: string;
    let foreignProjectId: string;
    let base: string;
    let management: ManagementFixture;

    const event = (overrides: Partial<TrackingEvent> = {}): TrackingEvent => ({
      eventId: randomUUID(),
      type: 'track',
      name: 'test_event',
      anonymousId: randomUUID(),
      occurredAt: new Date().toISOString(),
      properties: { source: 'integration' },
      ...overrides,
    });
    const path = () =>
      `/v1/workspaces/${management.workspaceId}/projects/${projectId}`;
    const request = (
      route: string,
      method = 'GET',
      body?: unknown,
      cookie = management.ownerCookie,
    ) =>
      fetch(`${base}/api${route}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Origin: process.env.APP_URL!,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    const ingest = (events: TrackingEvent[], key = projectKey) =>
      request('/v1/ingest', 'POST', { projectKey: key, events }, '');
    async function receipt(eventId: string) {
      return db.eventReceipt.findUniqueOrThrow({
        where: { projectId_eventId: { projectId, eventId } },
      });
    }
    async function processEvent(eventId: string) {
      const row = await receipt(eventId);
      await processReceipt(db, {
        receiptId: row.id,
        generation: row.generation,
      });
      return row.id;
    }

    beforeAll(async () => {
      if (
        process.env.TEST_DATABASE_ISOLATED !== '1' ||
        !process.env.EVENTLENS_QUEUE_PREFIX?.startsWith('eventlens_verify_')
      ) {
        throw new Error(
          'Run pnpm verify to create isolated database and queue fixtures',
        );
      }
      management = fixture();
      base = management.base;
      db = management.app.get(DatabaseService).client;
      queue = eventQueue(process.env.REDIS_URL!);
      const created = await request(
        `/v1/workspaces/${management.workspaceId}/projects`,
        'POST',
        { name: 'Pipeline integration' },
      );
      expect(created.status).toBe(201);
      const project = await created.json();
      projectId = project.project.id;
      projectKey = project.key;
      const viewer = await request(
        '/auth/sign-in/email',
        'POST',
        {
          email: management.viewerEmail,
          password: process.env.TEST_OWNER_PASSWORD,
        },
        '',
      );
      expect(viewer.status).toBe(200);
      viewerCookie = viewer.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      const workspace = await request('/v1/workspaces', 'POST', {
        name: 'Private event workspace',
      });
      expect(workspace.status).toBe(201);
      const privateWorkspace = await workspace.json();
      const foreign = await request(
        `/v1/workspaces/${privateWorkspace.id}/projects`,
        'POST',
        { name: 'Private events' },
      );
      expect(foreign.status).toBe(201);
      foreignProjectId = (await foreign.json()).project.id;
    });
    afterAll(async () => {
      await queue?.close();
    });

    it('accepts durable receipts without a worker and deduplicates concurrent deliveries', async () => {
      const value = event({ name: 'concurrent_delivery' });
      const results = await Promise.all(
        Array.from({ length: 8 }, () => ingest([value, value])),
      );
      expect(results.map((result) => result.status)).toEqual(
        Array(8).fill(202),
      );
      const bodies = await Promise.all(results.map((result) => result.json()));
      expect(bodies.reduce((count, result) => count + result.accepted, 0)).toBe(
        1,
      );
      expect(
        bodies.reduce((count, result) => count + result.duplicates, 0),
      ).toBe(15);
      const row = await receipt(value.eventId);
      expect(row.status).toBe('pending');
      expect(row.payload).toMatchObject({ name: value.name });
      expect(
        await db.eventOutbox.findUnique({ where: { receiptId: row.id } }),
      ).not.toBeNull();
      expect(
        await db.analyticsEvent.count({
          where: { projectId, eventId: value.eventId },
        }),
      ).toBe(0);
      await Promise.all([
        processEvent(value.eventId),
        processEvent(value.eventId),
      ]);
      expect(
        await db.analyticsEvent.count({
          where: { projectId, eventId: value.eventId },
        }),
      ).toBe(1);
      expect((await receipt(value.eventId)).payload).toBeNull();
    });

    it('validates whole batches and enforces the public ingestion boundary', async () => {
      const valid = event();
      const invalid = event({
        occurredAt: new Date(Date.now() - 31 * 86400000).toISOString(),
      });
      expect((await ingest([valid, invalid])).status).toBe(400);
      expect(
        await db.eventReceipt.count({
          where: { projectId, eventId: valid.eventId },
        }),
      ).toBe(0);
      expect(
        (await ingest(Array.from({ length: 51 }, () => event()))).status,
      ).toBe(400);
      expect((await ingest([valid], 'el_pk_' + 'x'.repeat(40))).status).toBe(
        401,
      );
      const text = await fetch(`${base}/api/v1/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      });
      expect(text.status).toBe(415);
      const preflight = await fetch(`${base}/api/v1/ingest`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://a-customer.example',
          'Access-Control-Request-Method': 'POST',
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
      expect(
        preflight.headers.get('access-control-allow-credentials'),
      ).toBeNull();
      const oversized = await fetch(`${base}/api/v1/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey, padding: 'x'.repeat(263000) }),
      });
      expect(oversized.status).toBe(413);
    });

    it('preserves the first identity association and flags conflicting accounts', async () => {
      const anonymousId = randomUUID();
      const anonymous = event({ anonymousId, name: 'anonymous_visit' });
      const identified = event({
        anonymousId,
        type: 'identify',
        name: 'identify',
        userId: 'first-account',
      });
      const conflicting = event({
        anonymousId,
        type: 'identify',
        name: 'identify',
        userId: 'second-account',
      });
      expect((await ingest([anonymous, identified, conflicting])).status).toBe(
        202,
      );
      for (const value of [anonymous, identified, conflicting])
        await processEvent(value.eventId);
      const link = await db.identityLink.findUniqueOrThrow({
        where: { projectId_anonymousId: { projectId, anonymousId } },
      });
      expect(link.userId).toBe('first-account');
      const before = await db.analyticsEvent.findUniqueOrThrow({
        where: { projectId_eventId: { projectId, eventId: anonymous.eventId } },
      });
      const after = await db.analyticsEvent.findUniqueOrThrow({
        where: {
          projectId_eventId: { projectId, eventId: conflicting.eventId },
        },
      });
      expect(before.userId).toBeNull();
      expect(before.identityConflict).toBe(false);
      expect(after.userId).toBe('second-account');
      expect(after.identityConflict).toBe(true);
    });

    it('serializes competing first associations without merging accounts', async () => {
      const anonymousId = randomUUID();
      const values = ['account-one', 'account-two'].map((userId) =>
        event({ anonymousId, userId }),
      );
      expect((await ingest(values)).status).toBe(202);
      await Promise.all(values.map((value) => processEvent(value.eventId)));
      const rows = await db.analyticsEvent.findMany({
        where: { projectId, anonymousId },
      });
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.identityConflict)).toHaveLength(1);
      const link = await db.identityLink.findUniqueOrThrow({
        where: { projectId_anonymousId: { projectId, anonymousId } },
      });
      expect(rows.find((row) => !row.identityConflict)?.userId).toBe(
        link.userId,
      );
    });

    it('recreates a lost Redis job from the durable outbox', async () => {
      const value = event({ name: 'outbox_recovery' });
      expect((await ingest([value])).status).toBe(202);
      const row = await receipt(value.eventId);
      const id = eventJobId({ receiptId: row.id, generation: row.generation });
      await dispatchOutbox(db, queue);
      const original = await queue.getJob(id);
      expect(original).toBeDefined();
      await original!.remove();
      await db.eventOutbox.update({
        where: { receiptId: row.id },
        data: { nextDispatchAt: new Date(0) },
      });
      await dispatchOutbox(db, queue);
      expect(await queue.getJob(id)).toBeDefined();
      await processEvent(value.eventId);
      expect(
        await db.eventOutbox.findUnique({ where: { receiptId: row.id } }),
      ).toBeNull();
      expect(
        await db.analyticsEvent.count({
          where: { projectId, eventId: value.eventId },
        }),
      ).toBe(1);
    });

    it('replays failed receipts with a new generation and protects operational controls', async () => {
      const value = event({ name: 'replayed_event' });
      expect((await ingest([value])).status).toBe(202);
      const row = await receipt(value.eventId);
      await recordFailure(
        db,
        { receiptId: row.id, generation: 0 },
        MAX_ATTEMPTS,
        true,
      );
      expect(
        (
          await request(
            `${path()}/processing/failures`,
            'GET',
            undefined,
            viewerCookie,
          )
        ).status,
      ).toBe(403);
      const failed = await request(`${path()}/processing/failures`);
      expect(failed.status).toBe(200);
      const listed = (await failed.json()).items.find(
        (item: { id: string }) => item.id === row.id,
      );
      expect(listed).toMatchObject({
        attempts: MAX_ATTEMPTS,
        errorCode: 'PROCESSING_FAILED',
      });
      expect(listed).not.toHaveProperty('payload');
      expect(
        (
          await request(
            `${path()}/processing/${row.id}/replay`,
            'POST',
            undefined,
            viewerCookie,
          )
        ).status,
      ).toBe(403);
      expect(
        (await request(`${path()}/processing/${row.id}/replay`, 'POST')).status,
      ).toBe(201);
      expect((await receipt(value.eventId)).generation).toBe(1);
      await processReceipt(db, { receiptId: row.id, generation: 0 });
      expect(await db.analyticsEvent.count({ where: { id: row.id } })).toBe(0);
      await processReceipt(db, { receiptId: row.id, generation: 1 });
      expect(await db.analyticsEvent.count({ where: { id: row.id } })).toBe(1);
      expect(
        (await request(`${path()}/processing/${row.id}/replay`, 'POST')).status,
      ).toBe(400);
    });

    it('filters and paginates stable event order and rejects unauthorized project reads', async () => {
      const time = new Date(Date.now() - 60000).toISOString();
      const actor = randomUUID();
      const values = Array.from({ length: 3 }, () =>
        event({
          name: 'pagination_case',
          anonymousId: actor,
          occurredAt: time,
        }),
      );
      expect((await ingest(values)).status).toBe(202);
      for (const value of values) await processEvent(value.eventId);
      const query = new URLSearchParams({
        limit: '2',
        name: 'pagination_case',
        actor,
        from: time,
        to: time,
      });
      const first = await request(
        `${path()}/events?${query}`,
        'GET',
        undefined,
        viewerCookie,
      );
      expect(first.status).toBe(200);
      const page = await first.json();
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeTruthy();
      query.set('cursor', page.nextCursor);
      const second = await (
        await request(
          `${path()}/events?${query}`,
          'GET',
          undefined,
          viewerCookie,
        )
      ).json();
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set(
          [...page.items, ...second.items].map(
            (row: { eventId: string }) => row.eventId,
          ),
        ).size,
      ).toBe(3);
      const detail = await request(
        `${path()}/events/${page.items[0].id}`,
        'GET',
        undefined,
        viewerCookie,
      );
      expect(detail.status).toBe(200);
      expect((await detail.json()).properties).toEqual({
        source: 'integration',
      });
      expect(
        (await request(`${path()}/events`, 'GET', undefined, '')).status,
      ).toBe(401);
      expect(
        (
          await request(
            `/v1/workspaces/${management.workspaceId}/projects/${foreignProjectId}/events`,
            'GET',
            undefined,
            viewerCookie,
          )
        ).status,
      ).toBe(404);
      const publicCredential = await fetch(`${base}/api${path()}/events`, {
        headers: { Authorization: `Bearer ${projectKey}` },
      });
      expect(publicCredential.status).toBe(401);
    });

    it('expires old payloads and event data while keeping deduplication tombstones', async () => {
      const old = new Date(Date.now() - 8 * 86400000);
      const value = event({
        name: 'retention_case',
        userId: 'old-account',
        occurredAt: old.toISOString(),
      });
      expect((await ingest([value])).status).toBe(202);
      const row = await receipt(value.eventId);
      await db.eventReceipt.update({
        where: { id: row.id },
        data: { receivedAt: old },
      });
      await processEvent(value.eventId);
      await db.identityLink.update({
        where: {
          projectId_anonymousId: { projectId, anonymousId: value.anonymousId },
        },
        data: { updatedAt: old },
      });
      const failed = event({ name: 'expired_failure' });
      expect((await ingest([failed])).status).toBe(202);
      const failedRow = await receipt(failed.eventId);
      await db.eventReceipt.update({
        where: { id: failedRow.id },
        data: {
          status: 'failed',
          failedAt: new Date(Date.now() - 15 * 86400000),
          attempts: MAX_ATTEMPTS,
        },
      });
      const result = await cleanupEvents(db, 7);
      expect(result.deletedEvents).toBeGreaterThanOrEqual(1);
      expect(result.expiredFailures).toBeGreaterThanOrEqual(1);
      expect(await db.analyticsEvent.count({ where: { id: row.id } })).toBe(0);
      expect(
        await db.identityLink.findUnique({
          where: {
            projectId_anonymousId: {
              projectId,
              anonymousId: value.anonymousId,
            },
          },
        }),
      ).toBeNull();
      expect((await receipt(failed.eventId)).status).toBe('expired');
      expect((await receipt(failed.eventId)).payload).toBeNull();
      expect(
        await db.eventOutbox.findUnique({ where: { receiptId: failedRow.id } }),
      ).toBeNull();
      expect(
        (await request(`${path()}/processing/${failedRow.id}/replay`, 'POST'))
          .status,
      ).toBe(400);
      expect(await (await ingest([value, failed])).json()).toMatchObject({
        accepted: 0,
        duplicates: 2,
      });
      expect(await db.eventReceipt.count({ where: { id: row.id } })).toBe(1);
    });

    it('keeps retry limits durable across queue loss and ignores stale generations', async () => {
      const value = event({ name: 'durable_retry_budget' });
      expect((await ingest([value])).status).toBe(202);
      const row = await receipt(value.eventId);
      const job = { receiptId: row.id, generation: 0 };
      expect(await reserveReceiptAttempt(db, job)).toBe(1);
      expect(await reserveReceiptAttempt(db, job)).toBe(2);
      await dispatchOutbox(db, queue);
      const queued = await queue.getJob(eventJobId(job));
      expect(queued).toBeDefined();
      await queued!.remove();
      await db.eventOutbox.update({
        where: { receiptId: row.id },
        data: { nextDispatchAt: new Date(0) },
      });
      await dispatchOutbox(db, queue);
      const reservations = await Promise.all(
        Array.from({ length: 5 }, () => reserveReceiptAttempt(db, job)),
      );
      expect(reservations.filter((attempt) => attempt !== null).sort()).toEqual(
        [3, 4, 5],
      );
      expect(reservations.filter((attempt) => attempt === null)).toHaveLength(
        2,
      );
      const exhausted = await receipt(value.eventId);
      expect(exhausted.status).toBe('failed');
      expect(exhausted.attempts).toBe(MAX_ATTEMPTS);
      expect(exhausted.payload).not.toBeNull();
      await recordFailure(db, job, 1, true);
      const preserved = await receipt(value.eventId);
      expect(preserved.attempts).toBe(MAX_ATTEMPTS);
      expect(preserved.failedAt).toEqual(exhausted.failedAt);
      expect(
        (await request(`${path()}/processing/${row.id}/replay`, 'POST')).status,
      ).toBe(201);
      expect(await reserveReceiptAttempt(db, job)).toBeNull();
      expect((await receipt(value.eventId)).attempts).toBe(0);
      expect(await reserveReceiptAttempt(db, { ...job, generation: 1 })).toBe(
        1,
      );
      await processReceipt(db, { ...job, generation: 1 });
    });
    it('delivers a Node SDK batch through the running worker into the explorer', async () => {
      const actor = randomUUID();
      const sdk = createEventLens({
        endpoint: base,
        projectKey,
        runtime: 'node',
        context: { anonymousId: actor },
        flushIntervalMs: 0,
        maxRetries: 0,
      });
      const runtime = new WorkerRuntime();
      try {
        expect(sdk.track('node_sdk_journey', { total: 42 })).toBe(true);
        await sdk.flush();
        expect(sdk.pendingCount).toBe(0);
        await runtime.onModuleInit();
        await expect
          .poll(
            async () => {
              const response = await request(
                `${path()}/events?name=node_sdk_journey&actor=${actor}`,
              );
              expect(response.status).toBe(200);
              return (await response.json()).items.length;
            },
            { timeout: 15000, interval: 250 },
          )
          .toBe(1);
        const response = await request(
          `${path()}/events?name=node_sdk_journey&actor=${actor}`,
        );
        expect((await response.json()).items[0].properties).toEqual({
          total: 42,
        });
        await expect
          .poll(async () => (await runtime.ready()).status, { timeout: 5000 })
          .toBe('ok');
      } finally {
        sdk.destroy();
        await runtime.onModuleDestroy();
      }
    });
  });
}
