import { defineConfig, devices } from '@playwright/test';

const browserChannel = process.env.PLAYWRIGHT_CHANNEL;
if (
  browserChannel !== undefined &&
  !['chrome', 'msedge'].includes(browserChannel)
) {
  throw new Error('PLAYWRIGHT_CHANNEL must be chrome or msedge when set.');
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...(browserChannel ? { channel: browserChannel } : {}),
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @eventlens/api start',
      env: { NODE_ENV: 'test', PORT: '3001' },
      url: 'http://localhost:3001/api/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'pnpm --filter @eventlens/worker start',
      env: { NODE_ENV: 'test', WORKER_PORT: '3002' },
      url: 'http://127.0.0.1:3002/health/ready',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'pnpm --filter @eventlens/web start',
      env: { NODE_ENV: 'production', PORT: '3000' },
      url: 'http://localhost:3000/login',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command:
        'pnpm --filter @eventlens/demo exec vite preview --host 127.0.0.1 --port 3003 --strictPort',
      env: { NODE_ENV: 'production' },
      url: 'http://127.0.0.1:3003',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
