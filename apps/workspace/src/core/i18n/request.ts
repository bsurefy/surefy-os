// SPDX-License-Identifier: AGPL-3.0-only
import { cookies, headers } from 'next/headers'

import { DEFAULT_LOCALE, LOCALES } from '@/constants/locales'
import { createRequestConfig, LOCALE_COOKIE, TIME_ZONE_COOKIE } from '@surefy/web-core/i18n'

import { loadAppMessages } from './loadAppMessages'

/**
 * next-intl's request config, registered in `next.config.ts` with
 * `createNextIntlPlugin('./src/core/i18n/request.ts')`. The locale is not in the URL: the
 * `surefy-locale` cookie (the profile preference or the organization default, already resolved),
 * then `Accept-Language`, then English (i18n.md §2). The time zone is the browser's, from the
 * `surefy-time-zone` cookie, or UTC.
 */
export default createRequestConfig({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  loadAppMessages,
  getRequestHints: async () => {
    const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
    return {
      locale: cookieStore.get(LOCALE_COOKIE)?.value,
      acceptLanguage: headerList.get('accept-language'),
      timeZone: cookieStore.get(TIME_ZONE_COOKIE)?.value,
    }
  },
})
