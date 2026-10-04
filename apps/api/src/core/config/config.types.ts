// SPDX-License-Identifier: AGPL-3.0-only
import type { LOG_LEVELS, NODE_ENVS } from './env.js'

export type ProcessName = 'api' | 'worker' | 'cli'
export type LogLevel = (typeof LOG_LEVELS)[number]
export type NodeEnv = (typeof NODE_ENVS)[number]

export interface OauthProviderConfig {
  clientId: string
  clientSecret: string
}

export type StorageConfig =
  | { driver: 'local'; path: string }
  | {
      driver: 's3'
      bucket: string
      region: string
      endpoint?: string
      forcePathStyle: boolean
      accessKeyId: string
      secretAccessKey: string
    }

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user?: string
  password?: string
}

export type MailConfig =
  { driver: 'console'; from: string } | { driver: 'smtp'; from: string; smtp: SmtpConfig }

/** The whole installation's configuration: read once, validated, frozen (see configuration.md). */
export interface Config {
  app: { name: string; env: NodeEnv; isProduction: boolean }
  api: { publicUrl: string; publicCorsOrigins: readonly string[] }
  /**
   * Trusted browser origins for sessions: app, then console and partner when configured. `apps`
   * names each one, so a session records the app it was created for (`sessions.app`).
   */
  web: {
    origins: readonly string[]
    apps: { workspace: string; console?: string; partner?: string }
  }
  ml: { url: string; token: string }
  /** From the entry point, not from env. */
  process: { name: ProcessName }
  log: { level: LogLevel }
  server: {
    host: string
    port: number
    docsEnabled: boolean
    trustProxy: boolean | number | string | readonly string[]
  }
  worker: { healthPort: number; concurrency: number }
  database: { url: string; migrationUrl?: string; poolSize: number }
  redis: { url: string }
  auth: {
    secret: string
    oauth: {
      google?: OauthProviderConfig
      microsoft?: OauthProviderConfig & { tenantId: string }
      github?: OauthProviderConfig
    }
  }
  crypto: { encryptionKey: string }
  setup: { token?: string }
  storage: StorageConfig
  mail: MailConfig
}
