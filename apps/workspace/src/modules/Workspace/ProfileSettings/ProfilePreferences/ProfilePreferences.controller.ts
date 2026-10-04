// SPDX-License-Identifier: AGPL-3.0-only
import { useLocale, useTranslations } from 'next-intl'

import { LOCALES } from '@/constants/locales'
import { localeSchema } from '@surefy/contracts'
import { THEMES } from '@surefy/web-core/providers'

import { useChangeLocale, useChangeTheme } from '../../Workspace.hooks'
import { getLanguageName } from '../../Workspace.labels'

export function useProfilePreferencesController() {
  const t = useTranslations('workspace.profile.preferences')
  const tTheme = useTranslations('common.theme')
  const locale = useLocale()
  const { theme, changeTheme } = useChangeTheme()
  const { changeLocale, isPending } = useChangeLocale()

  return {
    theme,
    themeOptions: THEMES.map((value) => ({ value, label: tTheme(value) })),
    onThemeChange: changeTheme,
    locale,
    localeOptions: LOCALES.map((value) => ({ value, label: getLanguageName(value) })),
    onLocaleChange: (value: string) => {
      const parsed = localeSchema.safeParse(value)
      if (parsed.success && parsed.data !== locale) changeLocale(parsed.data)
    },
    isSavingLocale: isPending,
    t,
  }
}
