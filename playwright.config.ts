import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm --filter @eventlens/api start', env: { NODE_ENV: 'test' }, url: 'http://localhost:3001/api/health/ready', reuseExistingServer: false, timeout: 60000 },
    { command: 'pnpm --filter @eventlens/web start', env: { NODE_ENV: 'production' }, url: 'http://localhost:3000/login', reuseExistingServer: false, timeout: 60000 },
  ],
});
