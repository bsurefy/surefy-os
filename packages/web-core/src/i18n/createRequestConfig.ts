// SPDX-License-Identifier: AGPL-3.0-only
import { getRequestConfig } from 'next-intl/server'

import { DEFAULT_TIME_ZONE } from './i18n.constants'
import { loadSharedMessages, mergeMessages } from './loadSharedMessages'
import { resolveLocale } from './resolveLocale'

import type { RequestConfigOptions } from './i18n.types'
import type { AbstractIntlMessages } from 'next-intl'

/** A time zone `Intl` accepts, or the default: a cookie is never trusted as is. */
export function resolveTimeZone(candidate: string | null | undefined): string {
  if (!candidate) return DEFAULT_TIME_ZONE
  try {
    return new Intl.DateTimeFormat('en', { timeZone: candidate }).resolvedOptions().timeZone
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

/**
 * The default export of each app's `src/core/i18n/request.ts`, registered in `next.config.ts` with
 * `createNextIntlPlugin('./src/core/i18n/request.ts')`. Resolves the locale (an explicit locale,
 * the `surefy-locale` cookie, `Accept-Language`, the default), then loads the shared namespaces
 * and the app's own and merges them into one messages object. The time zone comes from the
 * `surefy-time-zone` cookie and defaults to UTC, so server and client always format alike.
 */
export function createRequestConfig<
  Locale extends string,
  AppMessages extends AbstractIntlMessages,
>({
  locales,
  defaultLocale,
  loadAppMessages,
  getRequestHints,
}: RequestConfigOptions<Locale, AppMessages>) {
  return getRequestConfig(async ({ locale: explicitLocale }) => {
    const hints = (await getRequestHints?.()) ?? {}
    const locale = resolveLocale({
      locales,
      defaultLocale,
      candidates: [explicitLocale, hints.locale],
      acceptLanguage: hints.acceptLanguage,
    })
    const [shared, app] = await Promise.all([loadSharedMessages(locale), loadAppMessages(locale)])
    return {
      locale,
      messages: mergeMessages(shared, app),
      timeZone: resolveTimeZone(hints.timeZone),
    }
  })
}
