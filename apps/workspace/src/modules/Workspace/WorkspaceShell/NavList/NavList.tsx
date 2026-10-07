// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { EditionBadge } from '@surefy/ui/components/DataDisplay'
import { NavItem, SidebarGroup } from '@surefy/ui/components/Navigation'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useNavListController } from './NavList.controller'
import SettingsNavItem from './SettingsNavItem'
import { getFeatureEdition } from '../../Workspace.labels'

import type { NavListProps } from './NavList.types'

const SKELETON_ROWS = ['a', 'b', 'c', 'd']

/** The sidebar's groups and items, filtered by effective access; shared by the mobile menu. */
export default function NavList(props: Readonly<NavListProps>) {
  const { orgSlug, isCollapsed = false, onNavigate } = props
  const { groups, activeKey, t, tEditions } = useNavListController(props)

  if (!groups) {
    return (
      <div role="status" aria-label={t('loading')} className="flex flex-col gap-2 px-2">
        {SKELETON_ROWS.map((row) => (
          <Skeleton key={row} className="h-7 w-full" />
        ))}
      </div>
    )
  }

  return (
    <>
      {groups.map(({ group, items }) => (
        <SidebarGroup key={group} label={t(`groups.${group}`)} isCollapsed={isCollapsed}>
          {items.map(({ entry, isLocked }) =>
            entry.key === 'settings' ? (
              <SettingsNavItem
                key={entry.key}
                orgSlug={orgSlug}
                icon={entry.icon}
                isCollapsed={isCollapsed}
                onNavigate={onNavigate}
              />
            ) : (
              <NavItem
                key={entry.key}
                linkComponent={Link}
                href={entry.href(orgSlug)}
                label={t(`items.${entry.key}`)}
                icon={entry.icon}
                isActive={entry.key === activeKey}
                isCollapsed={isCollapsed}
                onClick={onNavigate}
                trailing={
                  isLocked && entry.feature ? (
                    <EditionBadge label={tEditions(getFeatureEdition(entry.feature))} />
                  ) : undefined
                }
              />
            ),
          )}
        </SidebarGroup>
      ))}
    </>
  )
}
