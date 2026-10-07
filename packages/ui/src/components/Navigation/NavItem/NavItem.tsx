// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { cn } from '../../../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../primitives/tooltip'

import type { NavItemProps } from './NavItem.types'

/** One sidebar item: 36px, 20px icon, label, count; collapsed items show the label in a tooltip. */
export default function NavItem({
  label,
  icon: Icon,
  count,
  isActive = false,
  isCollapsed = false,
  trailing,
  linkComponent: Comp = 'a',
  className,
  ...rest
}: Readonly<NavItemProps>) {
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" className="size-5 shrink-0" />}
      <span className={cn('min-w-0 flex-1 truncate', isCollapsed && 'sr-only')}>{label}</span>
      {!isCollapsed && trailing}
      {count !== undefined && count > 0 && !isCollapsed && (
        <span className="bg-warning-soft text-warning-soft-foreground text-caption rounded-full px-1.5 font-semibold tabular-nums">
          {count}
        </span>
      )}
    </>
  )
  const link = (
    <Comp
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'text-body text-foreground-secondary duration-fast hover:bg-surface-2 hover:text-foreground flex h-9 items-center gap-2.5 rounded-lg px-2.5 transition-colors',
        isActive &&
          'bg-sidebar-active text-sidebar-active-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground font-medium',
        isCollapsed && 'justify-center px-0',
        className,
      )}
      {...rest}
    >
      {content}
    </Comp>
  )
  return (
    <li>
      {isCollapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ) : (
        link
      )}
    </li>
  )
}
