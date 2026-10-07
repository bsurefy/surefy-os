// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useSyncExternalStore } from 'react'

import type { Locale } from '@surefy/contracts'
import { useEffectiveAccess } from '@surefy/web-core/access'
import { meQueries, useUpdateMeMutation } from '@surefy/web-core/api/me'
import { LOCALE_COOKIE } from '@surefy/web-core/i18n'
import { useThemePreference } from '@surefy/web-core/providers'
import type { Theme } from '@surefy/web-core/providers'

import { WORKSPACE_NAV } from './Workspace.constants'
import { getVisibleNav } from './Workspace.utils'

import type { NavContext, VisibleNavEntry } from './Workspace.types'

const LOCALE_COOKIE_MAX_AGE_S = 31_536_000
function noSubscription() {
  return () => {
    // nothing to unsubscribe from: the platform never changes
  }
}

/** The signed-in person (`GET /api/v1/me`), hydrated by the organization layout. */
export function useMe() {
  return useQuery(meQueries.current())
}

/** What navigation visibility is decided from; null until both requests are known. */
export function useNavContext(): NavContext | null {
  const { data: me } = useMe()
  const { data: access } = useEffectiveAccess()
  if (!me || !access) return null
  return { access, install: me.install, isInstallAdmin: me.isInstallAdmin }
}

/** The sidebar entries the person sees; null while access loads. */
export function useVisibleNav(): VisibleNavEntry[] | null {
  const context = useNavContext()
  return context ? getVisibleNav(WORKSPACE_NAV, context) : null
}

function detectApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(globalThis.navigator.userAgent)
}

/** "⌘" on Apple devices, "Ctrl" elsewhere (and during server rendering). */
export function useModifierKeyLabel(): string {
  const isApple = useSyncExternalStore(noSubscription, detectApplePlatform, () => false)
  return isApple ? '⌘' : 'Ctrl'
}

function subscribeOnline(onChange: () => void) {
  globalThis.addEventListener('online', onChange)
  globalThis.addEventListener('offline', onChange)
  return () => {
    globalThis.removeEventListener('online', onChange)
    globalThis.removeEventListener('offline', onChange)
  }
}

/** Whether the browser has a connection; true during server rendering. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => globalThis.navigator.onLine,
    () => true,
  )
}

/** Theme switch: applies on this device at once and saves it to the profile. */
export function useChangeTheme() {
  const { theme, setTheme } = useThemePreference()
  const { mutate } = useUpdateMeMutation()
  const changeTheme = (next: Theme) => {
    setTheme(next)
    mutate({ theme: next })
  }
  return { theme, changeTheme }
}

/**
 * Language switch (i18n.md §2): saves the profile, writes the locale cookie, then refreshes so
 * server components render in the new language.
 */
export function useChangeLocale() {
  const router = useRouter()
  const { mutate, isPending } = useUpdateMeMutation()
  const changeLocale = (locale: Locale) => {
    mutate(
      { locale },
      {
        onSuccess: () => {
          document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax`
          router.refresh()
        },
      },
    )
  }
  return { changeLocale, isPending }
}
