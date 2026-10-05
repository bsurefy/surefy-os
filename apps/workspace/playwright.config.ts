// SPDX-License-Identifier: AGPL-3.0-only
import { defineConfig, devices } from '@playwright/test'

import {
  apiEnv,
  apiUrl,
  mlServerUrl,
  modelServerUrl,
  OWNER_STATE,
  webEnv,
  webUrl,
} from './e2e/support/env'

const isCi = process.env.CI !== undefined
const SERVER_START_MS = 180_000

/**
 * End-to-end specs against the real API and a fresh database (testing.md §1). `pnpm test:e2e`
 * prepares the database first; Playwright then starts a stub model server, the API and the app, the `setup` project
 * runs first-run setup and signs the Owner in, and the specs reuse that session.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: 1,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : 'list',
  // `next dev` compiles each page on its first visit, which can take longer than the default 5 s
  expect: { timeout: 15_000 },
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    timezoneId: 'UTC',
    locale: 'en-US',
  },
  projects: [
    { name: 'setup', testMatch: '**/*.setup.ts' },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: OWNER_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      name: 'model',
      command: 'pnpm exec tsx e2e/support/modelServer.ts',
      url: `${modelServerUrl}/v1/models`,
      timeout: SERVER_START_MS,
      reuseExistingServer: false,
    },
    {
      name: 'ml',
      command: 'pnpm exec tsx e2e/support/mlServer.ts',
      url: `${mlServerUrl}/health/live`,
      timeout: SERVER_START_MS,
      reuseExistingServer: false,
    },
    {
      name: 'api',
      command: 'pnpm --filter @surefy/api exec tsx src/server.ts',
      url: `${apiUrl}/health/live`,
      env: apiEnv(),
      timeout: SERVER_START_MS,
      reuseExistingServer: false,
    },
    {
      name: 'workspace',
      command: 'pnpm exec next dev --webpack --port $WEB_PORT',
      url: `${webUrl}/login`,
      env: webEnv(),
      timeout: SERVER_START_MS,
      reuseExistingServer: false,
    },
  ],
})
