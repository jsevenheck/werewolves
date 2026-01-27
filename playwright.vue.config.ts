import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5174",
    headless: true,
  },
  webServer: [
    {
      command: "tsx server.ts",
      port: 3001,
      reuseExistingServer: !process.env.CI,
      env: {
        E2E_TESTS: "1",
      },
    },
    {
      command: "pnpm --filter werewolves-game-vue dev",
      port: 5174,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        E2E_TESTS: "1",
      },
    },
  ],
});
