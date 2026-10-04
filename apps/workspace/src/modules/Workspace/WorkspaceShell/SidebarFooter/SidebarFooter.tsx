// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { cn } from '@surefy/ui/lib/utils'
import { Button } from '@surefy/ui/primitives/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@surefy/ui/primitives/tooltip'

import { useSidebarFooterController } from './SidebarFooter.controller'
import UserAvatar from '../../UserAvatar'

import type { SidebarFooterProps } from './SidebarFooter.types'

/** Bottom of the sidebar: where the data lives, the collapse switch and the person. */
export default function SidebarFooter({
  orgSlug,
  isCollapsed = false,
  onToggleCollapsed,
}: Readonly<SidebarFooterProps>) {
  const { user, role, isSelfHosted, t } = useSidebarFooterController()
  const toggleLabel = isCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')

  return (
    <div className="flex flex-col gap-2">
      {isSelfHosted && !isCollapsed && (
        <p className="text-caption text-muted-foreground flex items-center gap-2 px-1">
          <span aria-hidden="true" className="bg-success size-2 shrink-0 rounded-full" />
          {t('context.selfHosted')}
        </p>
      )}
      {onToggleCollapsed && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              icon={isCollapsed ? PanelLeftOpen : PanelLeftClose}
              aria-label={toggleLabel}
              aria-keyshortcuts="["
              onClick={onToggleCollapsed}
              className={cn(!isCollapsed && 'self-end')}
            />
          </TooltipTrigger>
          <TooltipContent side="right">{toggleLabel}</TooltipContent>
        </Tooltip>
      )}
      {user && (
        <Link
          href={ROUTES.workspace.profile(orgSlug)}
          aria-label={isCollapsed ? t('userMenu.profile') : undefined}
          className={cn(
            'hover:bg-surface-2 focus-visible:ring-ring flex min-w-0 items-center gap-2 rounded-md p-1 outline-none focus-visible:ring-2',
            isCollapsed && 'justify-center',
          )}
        >
          <UserAvatar user={user} size="sm" />
          {!isCollapsed && (
            <span className="flex min-w-0 flex-col">
              <span className="text-body truncate font-medium">{user.name}</span>
              {role && <span className="text-caption text-muted-foreground truncate">{role}</span>}
            </span>
          )}
        </Link>
      )}
    </div>
  )
}
