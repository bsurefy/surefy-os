// SPDX-License-Identifier: AGPL-3.0-only
import type { ApiErrorCode } from '../http/http.types'

/** Keys of the shared `errors` namespace: one per code, plus the generic fallback. */
export type ErrorMessageKey = ApiErrorCode | 'fallback'

/**
 * The `errors` namespace translator: `useTranslations('errors')` or `getTranslations('errors')`.
 * Only the two members the error helpers use, so any next-intl translator fits.
 */
export interface ErrorsTranslator {
  (key: ErrorMessageKey): string
  has(key: ErrorMessageKey): boolean
}
