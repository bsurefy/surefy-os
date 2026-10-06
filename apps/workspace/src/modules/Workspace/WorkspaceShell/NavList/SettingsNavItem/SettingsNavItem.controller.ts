// SPDX-License-Identifier: AGPL-3.0-only
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { ROUTES } from '@/constants/routes'
// The files themselves, not the module entry: that entry carries server guards
import { SETTINGS_SECTIONS } from '@/modules/Settings/Settings.constants'
import { getVisibleSettingsSections } from '@/modules/Settings/Settings.utils'

import { useNavContext } from '../../../Workspace.hooks'

import type { SettingsNavSection } from './SettingsNavItem.types'

/** Sections that get a hint after their label, as in the settings navigation. */
const HINTED_SECTIONS = new Set(['vault'])

/**
 * The settings sections for the sidebar's Settings dropdown, built from the same visibility rules
 * as the settings navigation. The dropdown starts open on a settings page; the person can fold it.
 */
export function useSettingsNavItemController({
  orgSlug,
  isOnSettings,
}: {
  orgSlug: string
  isOnSettings: boolean
}) {
  const t = useTranslations('settings')
  const tNav = useTranslations('workspace.nav')
  const pathname = usePathname()
  const context = useNavContext()
  const [isOpen, setIsOpen] = useState(isOnSettings)

  const sections: SettingsNavSection[] = context
    ? getVisibleSettingsSections(SETTINGS_SECTIONS, context).map((entry) => {
        const href = ROUTES.workspace.settings(orgSlug, entry.section)
        return {
          id: entry.id,
          href,
          label: t(`sections.${entry.id}`),
          hint: HINTED_SECTIONS.has(entry.id) ? t(`sectionHints.${entry.id}`) : undefined,
          isActive: pathname === href || pathname.startsWith(`${href}/`),
        }
      })
    : []

  return { sections, isOpen, setIsOpen, label: tNav('items.settings') }
}
