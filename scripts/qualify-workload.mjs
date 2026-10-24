import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpus, totalmem, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { URLSearchParams } from 'node:url';
import { createApp } from '../apps/api/dist/server.js';
import { createDatabase } from '../packages/database/dist/index.js';
import { cleanupEvents } from '../packages/pipeline/dist/index.js';
import { run } from './process.mjs';

if (
  process.env.TEST_DATABASE_ISOLATED !== '1' ||
  !/^\/eventlens_verify_[0-9]+_[a-f0-9]{12}$/.test(
    new URL(process.env.DATABASE_URL).pathname,
  )
)
  throw new Error(
    'Workload qualification requires the generated disposable database',
  );
const db = createDatabase(process.env.DATABASE_URL);
const app = await createApp();
let projectId;
try {
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const signedIn = await fetch(base + '/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      Origin: process.env.APP_URL,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: process.env.TEST_OWNER_EMAIL,
      password: process.env.TEST_OWNER_PASSWORD,
    }),
  });
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const workspaces = await (
    await fetch(base + '/api/v1/workspaces', { headers: { Cookie: cookie } })
  ).json();
  const workspaceId = workspaces.items[0].id;
  const created = await fetch(
    `${base}/api/v1/workspaces/${workspaceId}/projects`,
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: process.env.APP_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Historical workload qualification' }),
    },
  );
  assert.equal(created.status, 201);
  projectId = (await created.json()).project.id;
  const today = Date.parse(
    new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
  );
  const from = new Date(today - 28 * 86400000).toISOString();
  const to = new Date(today).toISOString();
  const events = 100000;
  const actors = events / 10;
  for (let offset = 0; offset < events; offset += 1000) {
    await db.analyticsEvent.createMany({
      data: Array.from({ length: 1000 }, (_, local) => {
        const index = offset + local;
        const actor = Math.floor(index / 10);
        const step = index % 10;
        return {
          id: randomUUID(),
          eventId: randomUUID(),
          projectId,
          type: 'track',
          name: step ? 'level_completed' : 'game_started',
          anonymousId: `qualification-${actor}`,
          properties: { platform: 'qualification', level: step },
          occurredAt: new Date(
            Date.parse(from) + ((actor % 14) + step) * 86400000,
          ),
          receivedAt: new Date(),
        };
      }),
    });
  }
  const projectBase = `${base}/api/v1/workspaces/${workspaceId}/projects/${projectId}`;
  const definition = await fetch(projectBase + '/conversion-paths', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: process.env.APP_URL,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Qualification',
      steps: [{ name: 'game_started' }, { name: 'level_completed' }],
      windowMinutes: 43200,
    }),
  });
  assert.equal(definition.status, 201);
  const pathId = (await definition.json()).id;
  const reports = {};
  const workloads = [
    [
      'overview',
      '/analytics/overview?' + new URLSearchParams({ from, to }),
      (data) => assert.equal(data.totalEvents, events),
    ],
    [
      'conversion',
      `/conversion-paths/${pathId}/results?` +
        new URLSearchParams({ from, to }),
      (data) =>
        assert.deepEqual(
          data.steps.map((step) => step.users),
          [actors, actors],
        ),
    ],
    [
      'retention',
      '/retention?' +
        new URLSearchParams({
          from: from.slice(0, 10),
          to: to.slice(0, 10),
          entryEvent: 'game_started',
          returnEvent: 'level_completed',
          days: '7',
        }),
      (data) =>
        assert.equal(
          data.cohorts.reduce((sum, cohort) => sum + cohort.size, 0),
          actors,
        ),
    ],
  ];
  for (const [name, path, validate] of workloads) {
    const measure = async () => {
      const begin = performance.now();
      const response = await fetch(projectBase + path, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200, `${name} status`);
      validate(await response.json());
      return performance.now() - begin;
    };
    for (let index = 0; index < 4; index++) await measure();
    const samples = [];
    let index = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (index++ < 100) samples.push(await measure());
      }),
    );
    samples.sort((a, b) => a - b);
    reports[name] = {
      samples: samples.length,
      concurrency: 4,
      warmups: 4,
      latencyMs: {
        p50: samples[49],
        p95: samples[94],
        p99: samples[98],
        max: samples.at(-1),
      },
    };
  }
  const expiredAt = new Date(today - 100 * 86400000);
  await db.analyticsEvent.createMany({
    data: Array.from({ length: 3000 }, () => ({
      id: randomUUID(),
      eventId: randomUUID(),
      projectId,
      type: 'track',
      name: 'expired_qualification',
      anonymousId: 'expired',
      properties: {},
      occurredAt: expiredAt,
      receivedAt: expiredAt,
    })),
  });
  const cleanupStart = performance.now();
  let passes = 0;
  while (
    await db.analyticsEvent.count({
      where: { projectId, name: 'expired_qualification' },
    })
  ) {
    assert.ok(++passes <= 20, 'Cleanup failed to make bounded progress');
    await cleanupEvents(db, 90);
  }
  await writeFile(
    '.tmp/benchmark-qualification.json',
    JSON.stringify(
      {
        revision: await run('git', ['rev-parse', 'HEAD'], { capture: true }),
        measuredAt: new Date().toISOString(),
        host: {
          node: process.version,
          platform: platform(),
          arch: arch(),
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          memoryBytes: totalmem(),
        },
        dataset: {
          events,
          actors,
          entryDays: 14,
          eventDays: 23,
          rangeDays: 28,
        },
        reports,
        cleanup: {
          expiredEvents: 3000,
          passes,
          durationMs: performance.now() - cleanupStart,
        },
        limitations:
          'One local disposable PostgreSQL/Redis deployment; default cleanup cadence is one bounded pass per minute. Burst catch-up measurements do not change that cadence or establish a production SLA.',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  if (projectId) await db.project.delete({ where: { id: projectId } });
  await app.close();
  await db.$disconnect();
}
