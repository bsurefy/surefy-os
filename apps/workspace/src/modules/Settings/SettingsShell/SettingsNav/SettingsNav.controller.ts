// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { useEffectiveAccess } from '@surefy/web-core/access'
import { meQueries } from '@surefy/web-core/api/me'

import { SETTINGS_SECTIONS } from '../../Settings.constants'
import { getVisibleSettingsSections } from '../../Settings.utils'

/** The settings sections the person sees, with the open one marked; null while access loads. */
export function useSettingsNavController({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations('settings')
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
            isActive: pathname === href || pathname.startsWith(`${href}/`),
          }
        })
      : null

  return { items, navLabel: t('navLabel') }
}
