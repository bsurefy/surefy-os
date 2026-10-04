// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { envSchema } from './env.js'
import { toConfig } from './toConfig.js'

import type { Config, ProcessName } from './config.types.js'

const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/**
 * Validates an environment and reshapes it into a frozen `Config`. Throws `ConfigError` with the
 * prettified issues; `loadConfig` turns that into an exit.
 */
export function parseConfig(processName: ProcessName, env: unknown): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(result.error)}`)
  }
  return deepFreeze(toConfig(result.data, processName))
}

/**
 * The first call of every entry point: validate `process.env`, or exit with a clear message. A
 * misconfigured process never starts half-working.
 */
export function loadConfig(processName: ProcessName, env: NodeJS.ProcessEnv = process.env): Config {
  try {
    return parseConfig(processName, env)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    // The logger does not exist yet; this is the one place console output is allowed.
    // eslint-disable-next-line no-console
    console.error(error.message)
    process.exit(1)
  }
}
