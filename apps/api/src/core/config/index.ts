// SPDX-License-Identifier: AGPL-3.0-only
export type {
  Config,
  LogLevel,
  MailConfig,
  NodeEnv,
  OauthProviderConfig,
  ProcessName,
  SmtpConfig,
  StorageConfig,
} from './config.types.js'
export { envSchema, type Env } from './env.js'
export { ConfigError, loadConfig, parseConfig } from './loadConfig.js'
