// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useRouter } from 'next/navigation'
import { useTimeZone } from 'next-intl'
import { useEffect } from 'react'

import { TIME_ZONE_COOKIE } from './i18n.constants'

const COOKIE_MAX_AGE_S = 31_536_000

/**
 * Keeps the `surefy-time-zone` cookie equal to the browser's time zone, so the server formats
 * dates in the person's zone. On a first visit the page renders in UTC, the cookie is written and
 * the page refreshes once; afterwards server and client agree from the first render.
 */
export function TimeZoneSync() {
  const router = useRouter()
  const current = useTimeZone()
  useEffect(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!browserZone || browserZone === current) return
    document.cookie = `${TIME_ZONE_COOKIE}=${browserZone}; path=/; max-age=${String(COOKIE_MAX_AGE_S)}; samesite=lax`
    router.refresh()
  }, [current, router])
  return null
}
