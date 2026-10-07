// SPDX-License-Identifier: AGPL-3.0-only
/** The smallest valid environment: every required variable, placeholder values only. */
export const validEnv = {
  API_PUBLIC_URL: 'http://localhost:4000',
  APP_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgres://surefy_app:test@127.0.0.1:5432/surefy_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  AUTH_SECRET: 'a'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  ML_SERVICE_URL: 'http://127.0.0.1:8000',
  ML_SERVICE_TOKEN: 'b'.repeat(32),
} as const
