// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { useTheme } from 'next-themes'

import { Toaster } from '@surefy/ui/components/Feedback'

import { DEFAULT_THEME, isTheme } from './providers.constants'

/** The toaster follows the chosen theme (light, dark or system). */
export function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster theme={isTheme(theme) ? theme : DEFAULT_THEME} />
}
