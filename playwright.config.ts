import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm exec tsx standalone-server/src/index.ts',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: {
        E2E_TESTS: '1',
      },
    },
    {
      command: 'pnpm -C ui-vue dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      env: {
        E2E_TESTS: '1',
      },
    },
  ],
});
