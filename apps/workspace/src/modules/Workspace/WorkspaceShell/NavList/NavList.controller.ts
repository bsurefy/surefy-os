// SPDX-License-Identifier: AGPL-3.0-only
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { NAV_GROUPS } from '../../Workspace.constants'
import { useVisibleNav } from '../../Workspace.hooks'
import { getActiveNavEntry } from '../../Workspace.utils'

import type { NavListProps } from './NavList.types'

export function useNavListController({ orgSlug }: NavListProps) {
  const t = useTranslations('workspace.nav')
  const tEditions = useTranslations('editions.edition')
  const pathname = usePathname()
  const items = useVisibleNav()

  const activeKey = items ? getActiveNavEntry(items, pathname, orgSlug)?.entry.key : undefined
  const groups = items
    ? NAV_GROUPS.map((group) => ({
        group,
        items: items.filter((item) => item.entry.group === group),
      })).filter((section) => section.items.length > 0)
    : null

  return { groups, activeKey, t, tEditions }
}
