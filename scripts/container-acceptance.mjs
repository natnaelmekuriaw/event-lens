import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

if (
  process.env.TEST_DATABASE_ISOLATED !== '1' ||
  process.env.RELEASE_APP_URL !== 'https://localhost:8443'
)
  throw new Error(
    'Container acceptance is restricted to the disposable local HTTPS origin',
  );
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {},
);
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const request = context.request;
const base = process.env.RELEASE_APP_URL;
const headers = { Origin: base };
const statePath = '.tmp/release-container-state.json';
const mode = process.env.RELEASE_MODE ?? 'initial';
const startedAt = performance.now();
const latencies = [];
let maxPending = 0;
let lastAckAt = startedAt;
try {
  for (let attempt = 0; ; attempt++) {
    try {
      assert.equal(
        (await request.get(base + '/api/health/ready')).status(),
        200,
      );
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  let state;
  if (mode === 'initial') {
    const setup = await request.post(base + '/api/v1/setup', {
      headers,
      data: {
        token: process.env.BOOTSTRAP_TOKEN,
        name: 'Release owner',
        email: process.env.TEST_OWNER_EMAIL,
        password: process.env.TEST_OWNER_PASSWORD,
        workspaceName: 'Release workspace',
      },
    });
    assert.equal(setup.status(), 201);
    state = {
      runId: process.env.EVENTLENS_QUEUE_PREFIX,
      workspaceId: (await setup.json()).workspaceId,
      events: [],
    };
  } else state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(state.runId, process.env.EVENTLENS_QUEUE_PREFIX);
  const signedIn = await request.post(base + '/api/auth/sign-in/email', {
    headers,
    data: {
      email: process.env.TEST_OWNER_EMAIL,
      password: process.env.TEST_OWNER_PASSWORD,
    },
  });
  assert.equal(signedIn.status(), 200);
  const cookies = await context.cookies();
  assert.ok(
    cookies.some(
      (cookie) =>
        cookie.name.includes('session_token') &&
        cookie.secure &&
        cookie.httpOnly,
    ),
  );
  if (mode === 'initial') {
    const created = await request.post(
      `${base}/api/v1/workspaces/${state.workspaceId}/projects`,
      { headers, data: { name: 'Release GalaxyBalls' } },
    );
    assert.equal(created.status(), 201);
    const data = await created.json();
    state.projectId = data.project.id;
    state.key = data.key;
  }
  const projectPath = `/workspaces/${state.workspaceId}/projects/${state.projectId}`;
  if (mode !== 'resume') {
    const events = Array.from(
      { length: mode === 'sustained' ? 600 : 200 },
      (_, index) => ({
        eventId: randomUUID(),
        type: 'track',
        name: index % 2 ? 'level_completed' : 'game_started',
        anonymousId: `release-player-${Math.floor(index / 2) % 100}`,
        occurredAt: new Date().toISOString(),
        properties: { platform: 'synthetic-release', level: index % 5 },
      }),
    );
    const batchSize = mode === 'sustained' ? 10 : 50;
    for (let offset = 0; offset < events.length; offset += batchSize) {
      const batch = events.slice(offset, offset + batchSize);
      for (const event of batch) event.occurredAt = new Date().toISOString();
      const begin = performance.now();
      const response = await request.post(base + '/api/v1/ingest', {
        data: {
          projectKey: state.key,
          events: batch,
        },
      });
      assert.equal(response.status(), 202);
      assert.equal((await response.json()).accepted, batchSize);
      lastAckAt = performance.now();
      latencies.push(lastAckAt - begin);
      if (mode === 'sustained') {
        const status = await request.get(
          `${base}/api/v1${projectPath}/processing`,
        );
        maxPending = Math.max(maxPending, (await status.json()).pending);
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, 1000 - (performance.now() - begin))),
        );
      }
    }
    state.events.push(...events);
    await writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
  }
  if (mode === 'enqueue') {
    const status = await request.get(`${base}/api/v1${projectPath}/processing`);
    assert.ok((await status.json()).pending >= 200);
  } else {
    for (let attempt = 0; ; attempt++) {
      const status = await request.get(
        `${base}/api/v1${projectPath}/processing`,
      );
      if ((await status.json()).processed === state.events.length) break;
      if (attempt >= (mode === 'sustained' ? 30 : 90))
        throw new Error('Accepted receipts did not drain after recovery');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const duplicate = await request.post(base + '/api/v1/ingest', {
      data: { projectKey: state.key, events: state.events.slice(0, 50) },
    });
    assert.equal(duplicate.status(), 202);
    assert.equal((await duplicate.json()).duplicates, 50);
    if (mode === 'sustained') {
      latencies.sort((a, b) => a - b);
      await writeFile(
        '.tmp/benchmark-sustained.json',
        JSON.stringify(
          {
            measuredAt: new Date().toISOString(),
            workload: 'Production HTTPS ingestion and worker completion',
            dataset: {
              events: 600,
              actors: 100,
              targetEventsPerSecond: 10,
              batches: 60,
            },
            configuration: { batchSize: 10, concurrency: 1, warmup: false },
            durationMs: performance.now() - startedAt,
            drainAfterLastAckMs: performance.now() - lastAckAt,
            maxObservedPending: maxPending,
            requestLatencyMs: {
              p50: latencies[29],
              p95: latencies[56],
              p99: latencies[59],
              max: latencies.at(-1),
            },
            limitations:
              'One minute at a candidate 10 events/second on one local Docker host. Drain latency uses one-second polling and is not a per-event latency percentile or production SLA.',
          },
          null,
          2,
        ) + '\n',
      );
    }
  }
  assert.equal(
    (
      await request.patch(`${base}/api/v1${projectPath}`, {
        headers: { Origin: 'https://untrusted.example' },
        data: { name: 'Denied', timezone: 'UTC' },
      })
    ).status(),
    403,
  );
  if (mode === 'initial') {
    const page = await context.newPage();
    await mkdir('.tmp/screenshots', { recursive: true });
    await page.goto(base + projectPath + '/analytics');
    await page.getByRole('heading', { name: 'Trends', exact: true }).waitFor();
    await page.screenshot({
      path: '.tmp/screenshots/analytics.png',
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'Conversion paths', exact: true })
      .click();
    await page.getByLabel('Path name').fill('Game completion');
    await page.getByLabel('Event name').nth(0).fill('game_started');
    await page.getByLabel('Event name').nth(1).fill('level_completed');
    await page.getByRole('button', { name: 'Create path' }).click();
    await page
      .getByRole('table', { name: 'Conversion path results' })
      .waitFor();
    await page.screenshot({
      path: '.tmp/screenshots/conversion-paths.png',
      fullPage: true,
    });
    await page.goto(base + projectPath + '/retention');
    await page
      .getByLabel('Before (project date, exclusive)')
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.getByLabel('Entry event', { exact: true }).fill('game_started');
    await page
      .getByLabel('Return event', { exact: true })
      .fill('level_completed');
    await page.getByRole('button', { name: 'Calculate retention' }).click();
    await page.getByRole('table', { name: 'Daily cohort retention' }).waitFor();
    await page.screenshot({
      path: '.tmp/screenshots/retention.png',
      fullPage: true,
    });
  }
  console.log(`Production HTTPS acceptance passed (${mode}).`);
} finally {
  await context.close();
  await browser.close();
}
