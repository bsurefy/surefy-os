// SPDX-License-Identifier: AGPL-3.0-only
import { ERROR_CODE_SOURCES } from '@surefy/contracts'

/** The source locale: English messages are the reference every other locale must match. */
export const DEFAULT_LOCALE = 'en'

/** Holds only the resolved locale code; read by each app's `src/core/i18n/request.ts`. */
export const LOCALE_COOKIE = 'surefy-locale'

/** The namespaces `@surefy/web-core/messages` ships; apps cannot define namespaces with these names. */
export const SHARED_NAMESPACES = ['common', 'validation', 'errors'] as const
export type SharedNamespace = (typeof SHARED_NAMESPACES)[number]

/** One `errors/<domain>.json` per code source of the contracts (`common`, `auth`, `vault`…). */
export const ERROR_DOMAINS = Object.keys(ERROR_CODE_SOURCES) as (keyof typeof ERROR_CODE_SOURCES)[]
