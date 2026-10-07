// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url'

import { configDefaults, defineConfig } from 'vitest/config'

/**
 * Tests that need Postgres and Redis (testing.md, §2): everything under `test/`, plus the module
 * repository, route and job-processor tests. Everything else is a unit test and runs without Docker.
 */
const INTEGRATION_PATTERNS = [
  'test/**/*.test.ts',
  'src/**/*.repository.test.ts',
  'src/**/*.routes.test.ts',
  'src/**/*.processor.test.ts',
  'src/**/*.integration.test.ts',
]

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, ...INTEGRATION_PATTERNS],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: INTEGRATION_PATTERNS,
          // One Postgres and one Redis container per run; one database per test file.
          globalSetup: ['test/setup/globalSetup.ts'],
          setupFiles: ['test/setup/perFile.ts'],
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
})
