// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

import { cn } from '@surefy/ui/lib/utils'
import { Kbd } from '@surefy/ui/primitives/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@surefy/ui/primitives/tooltip'

import { useSidebarFooterController } from './SidebarFooter.controller'
import UserAvatar from '../../UserAvatar'
import UserMenu from '../UserMenu'

import type { SidebarFooterProps } from './SidebarFooter.types'

const rowClassName =
  'text-body text-foreground-secondary hover:bg-surface-2 hover:text-foreground focus-visible:ring-ring duration-fast flex h-9 w-full items-center gap-2.5 rounded-lg transition-colors outline-none focus-visible:ring-2'

/** Bottom of the sidebar: the collapse row and the person's menu. */
export default function SidebarFooter({
  orgSlug,
  isCollapsed = false,
  onToggleCollapsed,
}: Readonly<SidebarFooterProps>) {
  const { user, role, t } = useSidebarFooterController()
  const toggleLabel = isCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')
  const ToggleIcon = isCollapsed ? PanelLeftOpen : PanelLeftClose

  const toggle = onToggleCollapsed && (
    <button
      type="button"
      aria-label={isCollapsed ? toggleLabel : undefined}
      aria-keyshortcuts="["
      onClick={onToggleCollapsed}
      className={cn(rowClassName, isCollapsed ? 'justify-center px-0' : 'px-2.5')}
    >
      <ToggleIcon aria-hidden="true" className="size-5 shrink-0" />
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate text-left">{toggleLabel}</span>
          <Kbd>[</Kbd>
        </>
      )}
    </button>
  )

  return (
    <div className="flex flex-col gap-1">
      {toggle &&
        (isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{toggle}</TooltipTrigger>
            <TooltipContent side="right">{toggleLabel}</TooltipContent>
          </Tooltip>
        ) : (
          toggle
        ))}
      {user && (
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
                    {role && (
                      <span className="text-caption text-muted-foreground truncate">{role}</span>
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
      )}
    </div>
  )
}
