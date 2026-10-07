// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronsUpDown } from 'lucide-react'

import { cn } from '@surefy/ui/lib/utils'

import { useSidebarFooterController } from './SidebarFooter.controller'
import UserAvatar from '../../UserAvatar'
import UserMenu from '../UserMenu'

import type { SidebarFooterProps } from './SidebarFooter.types'

/**
 * Bottom of the sidebar: the person's button, with the organization's name under theirs. It opens
 * the user menu, which also holds the organization switcher.
 */
export default function SidebarFooter({
  orgSlug,
  isCollapsed = false,
}: Readonly<SidebarFooterProps>) {
  const { user, organizationName, t } = useSidebarFooterController(orgSlug)
  if (!user) return null

  return (
    <UserMenu
      orgSlug={orgSlug}
      side="top"
      align="start"
      trigger={
        <button
          type="button"
          aria-label={t('userMenu.label', { name: user.name })}
          className={cn(
            'hover:bg-surface-2 focus-visible:ring-ring data-[state=open]:bg-surface-2 duration-fast flex h-12 w-full min-w-0 items-center gap-2.5 rounded-lg text-left transition-colors outline-none focus-visible:ring-2',
            isCollapsed ? 'justify-center px-0' : 'px-2.5',
          )}
        >
          <UserAvatar user={user} />
          {!isCollapsed && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-label truncate">{user.name}</span>
                {organizationName && (
                  <span className="text-caption text-muted-foreground truncate">
                    {organizationName}
                  </span>
                )}
              </span>
              <ChevronsUpDown
                aria-hidden="true"
                className="text-muted-foreground size-3.5 shrink-0"
              />
            </>
          )}
        </button>
      }
    />
  )
}
