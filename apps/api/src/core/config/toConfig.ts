// SPDX-License-Identifier: AGPL-3.0-only
import type { Config, MailConfig, ProcessName, StorageConfig } from './config.types.js'
import type { Env } from './env.js'

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

/** `true`/`false`, a hop count, one address or keyword, or a comma-separated list. */
// eslint-disable-next-line sonarjs/function-return-type -- Fastify's option is a union by design
const parseTrustProxy = (value: string): Config['server']['trustProxy'] => {
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^\d+$/.test(value)) return Number(value)
  const list = splitList(value)
  return list.length === 1 ? (list[0] ?? value) : list
}

const toStorage = (env: Env): StorageConfig => {
  if (env.STORAGE_DRIVER === 'local') return { driver: 'local', path: env.STORAGE_LOCAL_PATH }
  return {
    driver: 's3',
    bucket: env.STORAGE_S3_BUCKET,
    region: env.STORAGE_S3_REGION,
    ...(env.STORAGE_S3_ENDPOINT === undefined ? {} : { endpoint: env.STORAGE_S3_ENDPOINT }),
    forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
  }
}

const toMail = (env: Env): MailConfig => {
  if (env.MAIL_DRIVER === 'console') return { driver: 'console', from: env.MAIL_FROM }
  return {
    driver: 'smtp',
    from: env.MAIL_FROM,
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER === undefined ? {} : { user: env.SMTP_USER }),
      ...(env.SMTP_PASSWORD === undefined ? {} : { password: env.SMTP_PASSWORD }),
    },
  }
}

const toOauth = (env: Env): Config['auth']['oauth'] => ({
  ...(env.OAUTH_GOOGLE_CLIENT_ID && env.OAUTH_GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.OAUTH_GOOGLE_CLIENT_ID,
          clientSecret: env.OAUTH_GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(env.OAUTH_MICROSOFT_CLIENT_ID && env.OAUTH_MICROSOFT_CLIENT_SECRET
    ? {
        microsoft: {
          clientId: env.OAUTH_MICROSOFT_CLIENT_ID,
          clientSecret: env.OAUTH_MICROSOFT_CLIENT_SECRET,
          tenantId: env.OAUTH_MICROSOFT_TENANT_ID,
        },
      }
    : {}),
  ...(env.OAUTH_GITHUB_CLIENT_ID && env.OAUTH_GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: env.OAUTH_GITHUB_CLIENT_ID,
          clientSecret: env.OAUTH_GITHUB_CLIENT_SECRET,
        },
      }
    : {}),
})

/** Reshapes the flat, validated env into grouped, typed settings. */
export function toConfig(env: Env, processName: ProcessName): Config {
  const isProduction = env.NODE_ENV === 'production'
  return {
    app: { name: env.APP_NAME, env: env.NODE_ENV, isProduction },
    api: { publicUrl: env.API_PUBLIC_URL, publicCorsOrigins: splitList(env.PUBLIC_CORS_ORIGINS) },
    web: {
      origins: [env.APP_ORIGIN, env.CONSOLE_ORIGIN, env.PARTNER_ORIGIN].filter(
        (origin): origin is string => origin !== undefined,
      ),
      apps: {
        workspace: env.APP_ORIGIN,
        ...(env.CONSOLE_ORIGIN === undefined ? {} : { console: env.CONSOLE_ORIGIN }),
        ...(env.PARTNER_ORIGIN === undefined ? {} : { partner: env.PARTNER_ORIGIN }),
      },
    },
    ml: { url: env.ML_SERVICE_URL, token: env.ML_SERVICE_TOKEN },
    process: { name: processName },
    log: { level: env.LOG_LEVEL },
    server: {
      host: env.API_HOST,
      port: env.API_PORT,
      // Docs are always on in development; production installs opt in.
      docsEnabled: env.API_DOCS_ENABLED || env.NODE_ENV === 'development',
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
    },
    worker: { healthPort: env.WORKER_HEALTH_PORT, concurrency: env.WORKER_CONCURRENCY },
    database: {
      url: env.DATABASE_URL,
      ...(env.DATABASE_MIGRATION_URL === undefined
        ? {}
        : { migrationUrl: env.DATABASE_MIGRATION_URL }),
      poolSize: env.DATABASE_POOL_SIZE,
    },
    redis: { url: env.REDIS_URL },
    auth: { secret: env.AUTH_SECRET, oauth: toOauth(env) },
    crypto: {
      encryptionKey: env.ENCRYPTION_KEY,
      ...(env.ENCRYPTION_KEY_PREVIOUS === undefined
        ? {}
        : { previousEncryptionKey: env.ENCRYPTION_KEY_PREVIOUS }),
    },
    setup: env.SETUP_TOKEN === undefined ? {} : { token: env.SETUP_TOKEN },
    storage: toStorage(env),
    mail: toMail(env),
  }
}
