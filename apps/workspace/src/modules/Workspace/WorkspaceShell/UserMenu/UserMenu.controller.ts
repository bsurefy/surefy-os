// SPDX-License-Identifier: AGPL-3.0-only
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { LOCALES } from '@/constants/locales'
import { useSignOut } from '@/core/auth/useSignOut'
import { localeSchema } from '@surefy/contracts'
import { THEMES, isTheme } from '@surefy/web-core/providers'

import { useChangeLocale, useChangeTheme, useMe } from '../../Workspace.hooks'
import { getLanguageName } from '../../Workspace.labels'
import { useShellOverlayStore } from '../../Workspace.store'

export function useUserMenuController() {
  const t = useTranslations('workspace.userMenu')
  const locale = useLocale()
  const tTheme = useTranslations('common.theme')
  const { data: me } = useMe()
  const signOut = useSignOut()
  const { theme, changeTheme } = useChangeTheme()
  const { changeLocale } = useChangeLocale()
  const setOverlay = useShellOverlayStore((state) => state.setOpen)
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false)

  return {
    user: me?.user,
    theme,
    themes: THEMES.map((value) => ({ value, label: tTheme(value) })),
    onThemeChange: (value: string) => {
      if (isTheme(value)) changeTheme(value)
    },
    locale,
    locales: LOCALES.map((value) => ({ value, label: getLanguageName(value) })),
    onLocaleChange: (value: string) => {
      const parsed = localeSchema.safeParse(value)
      if (parsed.success && parsed.data !== locale) changeLocale(parsed.data)
    },
    onOpenShortcuts: () => {
      setOverlay('shortcuts', true)
    },
    isUpgradeOpen,
    setIsUpgradeOpen,
    onSignOut: () => {
      void signOut()
    },
    t,
  }
}
