import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  if (process.env.TEST_DATABASE_ISOLATED !== '1') {
    throw new Error('Run pnpm verify to create isolated browser fixtures');
  }
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(process.env.TEST_OWNER_EMAIL!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.TEST_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your workspaces' }),
  ).toBeVisible();
}

async function createProject(page: Page, name: string) {
  const headers = { Origin: 'http://localhost:3000' };
  const workspace = await page.request.post('/api/v1/workspaces', {
    headers,
    data: { name: `Browser ${randomUUID().slice(0, 8)}` },
  });
  expect(workspace.status()).toBe(201);
  const { id: workspaceId } = await workspace.json();
  const project = await page.request.post(
    `/api/v1/workspaces/${workspaceId}/projects`,
    { headers, data: { name } },
  );
  expect(project.status()).toBe(201);
  const {
    project: { id: projectId },
    key,
  } = await project.json();
  return {
    workspaceId,
    projectId,
    key,
    path: `/workspaces/${workspaceId}/projects/${projectId}`,
  };
}

test('GalaxyBalls SDK events pass through the worker into the filtered explorer', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await signIn(page);
  const project = await createProject(page, 'GalaxyBalls journey');
  await page.goto(`${project.path}/events`);
  await expect(
    page.getByRole('heading', { name: 'No events match yet' }),
  ).toBeVisible();
  await page.getByLabel('Live updates').check();
  const demo = await context.newPage();
  await demo.goto('http://127.0.0.1:3003');
  await demo
    .getByLabel('API endpoint', { exact: true })
    .fill('http://localhost:3001');
  await demo
    .getByLabel('Public project key', { exact: true })
    .fill(project.key);
  await demo.getByRole('button', { name: 'Connect analytics' }).click();
  await expect(
    demo.getByText('Analytics client ready.', { exact: true }),
  ).toBeVisible();
  const started = demo.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/ingest') &&
      response
        .request()
        .postDataJSON()
        .events.some(
          (event: { name: string }) => event.name === 'game_started',
        ),
  );
  await demo.getByRole('button', { name: 'Start game', exact: true }).click();
  expect((await started).status()).toBe(202);
  const completed = demo.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/ingest') &&
      response
        .request()
        .postDataJSON()
        .events.some(
          (event: { name: string }) => event.name === 'level_completed',
        ),
  );
  await demo
    .getByRole('button', { name: 'Complete level', exact: true })
    .click();
  expect((await completed).status()).toBe(202);
  await expect(
    page.getByRole('cell', { name: 'level_completed track', exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByLabel('Live updates').uncheck();
  await page.getByLabel('Event name', { exact: true }).fill('level_completed');
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: /^Inspect level_completed / }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /^Inspect game_started / }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: /^Inspect level_completed / }).click();
  const detail = page.getByRole('region', {
    name: 'Event details',
    exact: true,
  });
  await expect(detail).toBeVisible();
  await expect(detail.locator('pre')).toContainText(
    '"platform": "demo-browser"',
  );
  await expect(detail.locator('pre')).toContainText('"score": 100');
  await expect(detail.locator('pre')).toContainText('"level": 1');
  await demo.getByLabel('Opt out of tracking').check();
  const before = await page.request.get(
    `/api/v1/workspaces/${project.workspaceId}/projects/${project.projectId}/processing`,
  );
  const previous = await before.json();
  await demo.getByRole('button', { name: 'Game over', exact: true }).click();
  await expect(demo.getByText('No event sent.', { exact: true })).toBeVisible();
  const after = await page.request.get(
    `/api/v1/workspaces/${project.workspaceId}/projects/${project.projectId}/processing`,
  );
  const current = await after.json();
  const total = (value: {
    pending: number;
    processed: number;
    failed: number;
    expired: number;
  }) => value.pending + value.processed + value.failed + value.expired;
  expect(total(current)).toBe(total(previous));
  await demo.close();
});

test('record ingestion latency and throughput against a dedicated isolated project', async ({
  page,
}) => {
  test.setTimeout(120000);
  await signIn(page);
  const project = await createProject(page, 'Ingestion benchmark');
  console.log(
    'Running the ingestion benchmark against the isolated verification project.',
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL('../../scripts/benchmark-ingestion.mjs', import.meta.url),
        ),
      ],
      {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        env: {
          ...process.env,
          BENCHMARK_API_URL: 'http://localhost:3001',
          BENCHMARK_PROJECT_KEY: project.key,
          BENCHMARK_OUTPUT: '.tmp/benchmark-ingestion.json',
        },
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
      },
    );
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Ingestion benchmark failed (${signal ?? code})`));
    });
  });
});
