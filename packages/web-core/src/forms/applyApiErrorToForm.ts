// SPDX-License-Identifier: AGPL-3.0-only
import { ERROR_CODES } from '@surefy/contracts'

import { getErrorMessage } from '../errors/getErrorMessage'
import { isApiError } from '../errors/isApiError'

import type { ErrorsTranslator } from '../errors/errors.types'
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'

/** Prefix of the `validation` keys for server-side issue codes (`issues.too_small`). */
export const SERVER_ISSUE_KEY_PREFIX = 'issues.'

/**
 * Puts an API error on the form. `VALIDATION_FAILED` details land on their fields as `issues.<code>`
 * keys of the `validation` namespace (the backend's English `message` is for logs only); any other
 * code becomes the translated `root` error, shown above the submit button. Anything that is not an
 * `ApiError` is rethrown.
 */
export function applyApiErrorToForm<Values extends FieldValues>(
  error: unknown,
  form: UseFormReturn<Values>,
  tErrors: ErrorsTranslator,
): void {
  if (!isApiError(error)) throw error
  if (error.code === ERROR_CODES.VALIDATION_FAILED && error.details.length > 0) {
    for (const { path, code } of error.details) {
      form.setError(path as Path<Values>, { message: `${SERVER_ISSUE_KEY_PREFIX}${code}` })
    }
    return
  }
  form.setError('root', { message: getErrorMessage(error, tErrors) })
}
