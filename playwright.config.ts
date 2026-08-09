import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4321',
    ...devices['iPhone 13'],
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4321 --strictPort',
    port: 4321,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
