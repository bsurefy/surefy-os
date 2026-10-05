// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError, ServiceUnavailableError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

/** The model is not allowed to this caller, disabled, unknown, or not local in a private chat. */
export class ModelNotAllowedError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.MODEL_NOT_ALLOWED, 'This model is not available to you')
  }
}

/** Neither the model nor any fallback could serve the call. */
export class ModelProviderUnavailableError extends ServiceUnavailableError {
  constructor(reasonCode: string | null) {
    super(ERROR_CODES.MODEL_PROVIDER_UNAVAILABLE, 'The model provider is unavailable', {
      details: reasonCode === null ? [] : [{ reasonCode }],
    })
  }
}
