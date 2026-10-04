// SPDX-License-Identifier: AGPL-3.0-only
import { getRequestConfig } from 'next-intl/server'

import { loadSharedMessages, mergeMessages } from './loadSharedMessages'
import { resolveLocale } from './resolveLocale'

import type { RequestConfigOptions } from './i18n.types'
import type { AbstractIntlMessages } from 'next-intl'

/**
 * The default export of each app's `src/core/i18n/request.ts`, registered in `next.config.ts` with
 * `createNextIntlPlugin('./src/core/i18n/request.ts')`. Resolves the locale (an explicit locale,
 * the `surefy-locale` cookie, `Accept-Language`, the default), then loads the shared namespaces
 * and the app's own and merges them into one messages object.
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
      timeZone: hints.timeZone ?? undefined,
    }
  })
}
