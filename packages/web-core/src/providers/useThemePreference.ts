// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

import { DEFAULT_THEME, isTheme } from './providers.constants'

import type { Theme } from './providers.constants'

export interface ThemePreference {
  /** The chosen theme; the default until the browser has read the stored choice. */
  theme: Theme
  setTheme: (theme: Theme) => void
}

/**
 * The theme chosen on this device (light, dark or system), for the apps' theme switches. Apps
 * never import next-themes themselves: `CoreProviders` owns the theme provider.
 */
export function useThemePreference(): ThemePreference {
  const { theme, setTheme } = useTheme()
  // The server renders the default; a browser that reads the stored choice while it hydrates would
  // render something else, and React keeps the server's markup for a control whose attributes differ.
  const isHydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  )
  return { theme: isHydrated && isTheme(theme) ? theme : DEFAULT_THEME, setTheme }
}

function stopListening(): void {
  // nothing to unsubscribe from
}

const subscribeToNothing = () => stopListening
