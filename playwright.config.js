const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true
  },
  webServer: {
    command: 'node server.js',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    env: {
      E2E_TESTS: '1'
    }
  }
});
