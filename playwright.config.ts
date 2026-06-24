import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  workers: process.env.CI ? 1 : 4,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm exec tsx server/src/index.ts',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: {
        E2E_TESTS: '1',
        WEREWOLVES_ADMIN_TOKEN: process.env.WEREWOLVES_ADMIN_TOKEN ?? 'e2e-admin-token',
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
