// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { mailEnvSchema } from './mailEnv.js'
import { oauthEnvSchema } from './oauthEnv.js'
import { storageEnvSchema } from './storageEnv.js'

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
export const NODE_ENVS = ['development', 'test', 'production'] as const

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  APP_NAME: z.string().default('SurefyOS'),
  API_PUBLIC_URL: z.url(), // https://api.surefyos.com (machine clients, widget, webhooks)
  APP_ORIGIN: z.url(), // https://app.surefyos.com
  CONSOLE_ORIGIN: z.url().optional(), // Cloud only
  PARTNER_ORIGIN: z.url().optional(), // Cloud only
  PUBLIC_CORS_ORIGINS: z.string().default(''), // comma-separated extra origins for api.* (widget hosts are per agent)
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().default(4000),
  API_DOCS_ENABLED: z.stringbool().default(false),
  TRUST_PROXY: z.string().default('loopback'), // Fastify trustProxy: proxy IPs/CIDRs, or a hop count
  WORKER_HEALTH_PORT: z.coerce.number().int().default(4001), // internal only
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5), // jobs processed at once, per queue
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

  DATABASE_URL: z.url(), // surefy_app role
  DATABASE_MIGRATION_URL: z.url().optional(), // surefy_owner role; required only by db:migrate
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).default(10),
  REDIS_URL: z.url(),

  AUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z
    .base64()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64'),
  SETUP_TOKEN: z.string().min(16).optional(),

  ML_SERVICE_URL: z.url(), // internal, e.g. http://ml:8000
  ML_SERVICE_TOKEN: z.string().min(32),
})

// Driver fragments are discriminated unions on STORAGE_DRIVER / MAIL_DRIVER. Driver defaults are
// applied before parsing, because a discriminated union needs its discriminator present.
const withDriverDefaults = (env: unknown) => ({
  STORAGE_DRIVER: 'local',
  MAIL_DRIVER: 'console',
  ...(env as Record<string, unknown>),
})

export const envSchema = z.preprocess(
  withDriverDefaults,
  baseEnvSchema.and(storageEnvSchema).and(mailEnvSchema).and(oauthEnvSchema),
)
export type Env = z.infer<typeof envSchema>
