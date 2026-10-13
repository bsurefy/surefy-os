// SPDX-License-Identifier: AGPL-3.0-only
import { AppError } from '@/core/errors/index.js'
import { providerErrorFrom } from '@/integrations/ai/index.js'
import { ERROR_CODES } from '@surefy/contracts'

import { RunFailure } from './agentRuns.errors.js'

/**
 * The API error code a failure ends the run with, or null for an infrastructure error (database,
 * Redis, a bug): those are thrown so BullMQ retries the job and the claim makes every attempt
 * safe. A model that is down or a budget that ran out is the run's failure, not the worker's.
 */
export function failureCodeOf(error: unknown): string | null {
  if (error instanceof RunFailure) return error.code
  if (error instanceof AppError) return error.code
  if (providerErrorFrom(error) !== null) return ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE
  return null
}
