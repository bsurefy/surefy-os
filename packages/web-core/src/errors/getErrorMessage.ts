// SPDX-License-Identifier: AGPL-3.0-only
import { isApiError } from './isApiError'

import type { ErrorsTranslator } from './errors.types'

/** The translated text for an error: its code's entry when there is one, else the fallback. */
export function getErrorMessage(error: unknown, t: ErrorsTranslator): string {
  if (isApiError(error) && t.has(error.code)) return t(error.code)
  return t('fallback')
}
