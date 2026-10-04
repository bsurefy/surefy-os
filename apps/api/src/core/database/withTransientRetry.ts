// SPDX-License-Identifier: AGPL-3.0-only
import { setTimeout as sleep } from 'node:timers/promises'

import { ServiceUnavailableError } from '@/core/errors/index.js'

/** Postgres SQLSTATEs that mean "try the whole transaction again". */
export const TRANSIENT_SQLSTATES = new Set(['40001', '40P01']) // serialization failure, deadlock

export interface TransientRetryOptions {
  /** Total attempts, including the first one. */
  attempts?: number
  /** Base delay in milliseconds; doubles on every retry. */
  baseDelayMs?: number
}

const DEFAULTS = { attempts: 3, baseDelayMs: 20 } satisfies Required<TransientRetryOptions>

/** The Postgres error code of a thrown value, when `pg` produced it. */
export const sqlState = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

export const isTransientError = (error: unknown): boolean => {
  const code = sqlState(error)
  return code !== undefined && TRANSIENT_SQLSTATES.has(code)
}

/**
 * Retries a whole transaction a bounded number of times on deadlocks and serialization failures,
 * then throws `ServiceUnavailableError`. Safe only because nothing with side effects outside the
 * database runs inside a transaction.
 */
export async function withTransientRetry<T>(
  run: () => Promise<T>,
  options: TransientRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULTS.attempts
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      if (!isTransientError(error)) throw error
      if (attempt >= attempts) {
        throw new ServiceUnavailableError(undefined, 'Database transaction could not complete', {
          cause: error,
          meta: { attempts, sqlState: sqlState(error) },
        })
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1))
    }
  }
}
