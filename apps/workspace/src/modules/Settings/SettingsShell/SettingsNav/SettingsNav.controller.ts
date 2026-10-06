// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import {
  Database,
  KeyRound,
  Lock,
  Server,
  Settings2,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { useEffectiveAccess } from '@surefy/web-core/access'
import { meQueries } from '@surefy/web-core/api/me'

import { SETTINGS_SECTIONS } from '../../Settings.constants'
import { getVisibleSettingsSections } from '../../Settings.utils'

import type { SettingsSectionEntry } from '../../Settings.types'
import type { LucideIcon } from 'lucide-react'

const ICONS: Record<SettingsSectionEntry['id'], LucideIcon> = {
  general: Settings2,
  members: Users,
  teams: UsersRound,
  access: ShieldCheck,
  vault: KeyRound,
  dataPrivacy: Database,
  security: Lock,
  install: Server,
}

/** The settings sections the person sees, with the open one marked; null while access loads. */
export function useSettingsNavController({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations('settings')
  const tCommon = useTranslations('common')
  const pathname = usePathname()
  const { data: me } = useQuery(meQueries.current())
  const { data: access } = useEffectiveAccess()

  const items =
    me && access
      ? getVisibleSettingsSections(SETTINGS_SECTIONS, {
          access,
          install: me.install,
          isInstallAdmin: me.isInstallAdmin,
        }).map((entry) => {
          const href = ROUTES.workspace.settings(orgSlug, entry.section)
          return {
            id: entry.id,
            href,
            label: t(`sections.${entry.id}`),
            icon: ICONS[entry.id],
            isActive: pathname === href || pathname.startsWith(`${href}/`),
          }
        })
      : null

  // Descriptive copy only (ADR 0020): `hosting` never gates anything
  const hostingLine = me
    ? t('hostingLine', {
        product: tCommon('productName'),
        hosting: t(`hosting.${me.install.hosting}`),
      })
    : null

  return { items, navLabel: t('navLabel'), title: t('title'), hostingLine }
}
