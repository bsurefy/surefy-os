// SPDX-License-Identifier: AGPL-3.0-only
import { pino, type Logger, type LoggerOptions } from 'pino'

import { REDACT_PATHS } from './redact.js'

import type { Config } from '@/core/config/index.js'

export type { Logger } from 'pino'

/**
 * One set of options for the server and the worker, aligned with the ML service's log lines:
 * `msg`, `level` (label), `time` (ISO 8601), `service`, plus `reqId` / `orgId` when known.
 */
export const loggerOptions = (config: Config): LoggerOptions => ({
  level: config.log.level,
  base: { service: config.process.name },
  messageKey: 'msg',
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: [...REDACT_PATHS], censor: '[redacted]' },
  serializers: { err: pino.stdSerializers.errWithCause },
  // JSON to stdout in production; pino-pretty only in development and tests.
  ...(config.app.isProduction ? {} : { transport: { target: 'pino-pretty' } }),
})

/** Creates the process logger. Fastify receives it through `loggerInstance`. */
export function createLogger(config: Config): Logger {
  return pino(loggerOptions(config))
}
