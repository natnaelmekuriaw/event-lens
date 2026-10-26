import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@eventlens/database';
import type { createApp } from '../../apps/api/src/server.js';
import { DatabaseService } from '../../apps/api/src/database.service.js';
import {
  createCredentialUser,
  hashPassword,
} from '../../apps/api/src/auth/credentials.js';
import { recoverAccount } from '../../apps/api/src/auth/recovery.js';
import { runFunnel } from '../../apps/api/src/funnels/runner.js';
import { withReport } from '../../apps/api/src/analytics/report.js';

export function defineReleaseCases(
  fixture: () => {
    app: Awaited<ReturnType<typeof createApp>>;
    base: string;
    workspaceId: string;
  },
) {
  describe('release recovery and consistency', () => {
    it('recovers an existing password, revokes sessions, and preserves membership', async () => {
      const { app, base, workspaceId } = fixture();
      const db = app.get(DatabaseService).client;
      const email = `recover-${randomUUID()}@example.com`;
      const previous = randomUUID();
      const next = randomUUID();
      const previousHash = await hashPassword(previous);
      const user = await db.$transaction((tx) =>
        createCredentialUser(
          tx,
          { email, name: 'Recovery fixture' },
          previousHash,
        ),
      );
      async function signIn(password: string) {
        return fetch(`${base}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: process.env.APP_URL!,
          },
          body: JSON.stringify({ email, password }),
        });
      }
      await db.membership.create({
        data: { userId: user.id, workspaceId, role: 'viewer' },
      });
      expect((await signIn(previous)).status).toBe(200);
      expect(
        await db.session.count({ where: { userId: user.id } }),
      ).toBeGreaterThan(0);
      await recoverAccount(db, email, next);
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
      expect((await signIn(previous)).status).toBe(401);
      expect((await signIn(next)).status).toBe(200);
      expect(
        await db.membership.count({
          where: { userId: user.id, workspaceId, role: 'viewer' },
        }),
      ).toBe(1);
      await expect(recoverAccount(db, `absent-${email}`, next)).rejects.toThrow(
        'not found',
      );
    });
    it('keeps identity stable when linking commits between conversion pages', async () => {
      const db = fixture().app.get(DatabaseService).client;
      const project = await db.project.create({
        data: {
          workspaceId: fixture().workspaceId,
          name: 'Snapshot fixture',
          keyHash: randomUUID(),
          keyPrefix: 'test',
        },
      });
      try {
        const from = new Date(Date.now() - 86400000);
        const to = new Date(from.getTime() + 60000);
        await db.analyticsEvent.createMany({
          data: Array.from({ length: 1001 }, (_, index) => ({
            id: randomUUID(),
            eventId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            projectId: project.id,
            type: 'track',
            name: index === 1000 ? 'finish' : 'start',
            anonymousId: index === 1000 ? 'actor-0' : `actor-${index}`,
            properties: {},
            occurredAt: new Date(from.getTime() + index),
            receivedAt: from,
          })),
        });
        let linked = false;
        const wrapped = new Proxy(db, {
          get(target, key) {
            if (key === '$transaction')
              return (
                action: (tx: Prisma.TransactionClient) => Promise<unknown>,
                options: unknown,
              ) =>
                target.$transaction(
                  async (tx) =>
                    action(
                      new Proxy(tx, {
                        get(inner, member) {
                          if (member === '$queryRaw')
                            return async (...args: unknown[]) => {
                              const rows = await (
                                inner.$queryRaw as (
                                  ...args: unknown[]
                                ) => Promise<unknown[]>
                              ).apply(inner, args);
                              if (!linked && rows.length === 1000) {
                                linked = true;
                                await db.identityLink.create({
                                  data: {
                                    projectId: project.id,
                                    anonymousId: 'actor-0',
                                    userId: 'linked-user',
                                  },
                                });
                              }
                              return rows;
                            };
                          const value = Reflect.get(inner, member);
                          return typeof value === 'function'
                            ? value.bind(inner)
                            : value;
                        },
                      }),
                    ),
                  options as Parameters<typeof target.$transaction>[1],
                );
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }) as PrismaClient;
        const result = await runFunnel(
          wrapped,
          randomUUID(),
          project.id,
          {
            name: 'Snapshot',
            steps: [{ name: 'start' }, { name: 'finish' }],
            windowMinutes: 1,
          },
          { from: from.toISOString(), to: to.toISOString() },
        );
        expect(linked).toBe(true);
        expect(result.steps.map((step) => step.users)).toEqual([1000, 1]);
      } finally {
        await db.project.delete({ where: { id: project.id } });
      }
    });
    it('cancels a slow statement and serves the next report normally', async () => {
      const db = fixture().app.get(DatabaseService).client;
      await expect(
        withReport(db, async (tx) => {
          await tx.$executeRaw`SET LOCAL statement_timeout = '20ms'`;
          await tx.$queryRaw`SELECT pg_sleep(0.1)::text`;
        }),
      ).rejects.toMatchObject({ status: 408 });
      expect(
        await withReport(db, (tx) => tx.$queryRaw`SELECT 1 AS value`),
      ).toEqual([{ value: 1 }]);
    });
  });
}
