// SPDX-License-Identifier: AGPL-3.0-only
import { useId } from 'react'

import { cn } from '../../../lib/utils'

import type { SidebarGroupProps, SidebarProps } from './Sidebar.types'

/**
 * Sidebar frame: 248px open, 64px collapsed (docs/design/shared/components.md, Navigation).
 * From the top: brand row (60px), switcher, scrolling groups, footer with a top border.
 */
export default function Sidebar({
  isCollapsed = false,
  brand,
  header,
  footer,
  label,
  className,
  children,
  ...rest
}: Readonly<SidebarProps>) {
  return (
    <nav
      aria-label={label}
      data-collapsed={isCollapsed || undefined}
      className={cn(
        'z-frame border-sidebar-border bg-sidebar text-sidebar-foreground duration-base sticky top-0 flex h-dvh shrink-0 flex-col border-r transition-[width] ease-out',
        isCollapsed ? 'w-16' : 'w-62',
        className,
      )}
      {...rest}
    >
      {brand && (
        <div
          className={cn(
            'flex h-15 shrink-0 items-center',
            isCollapsed ? 'justify-center px-0' : 'px-[1.125rem]',
          )}
        >
          {brand}
        </div>
      )}
      {header && <div className="shrink-0 px-3 pb-2">{header}</div>}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-2">{children}</div>
      {footer && (
        <div className="border-sidebar-border shrink-0 border-t px-3 pt-2 pb-3">{footer}</div>
      )}
    </nav>
  )
}

export function SidebarGroup({
  label,
  isCollapsed = false,
  className,
  children,
  ...rest
}: Readonly<SidebarGroupProps>) {
  const labelId = useId()
  return (
    <div
      role="group"
      aria-labelledby={label ? labelId : undefined}
      className={cn('flex flex-col gap-0.5', className)}
      {...rest}
    >
      {label && (
        <div
          id={labelId}
          className={cn(
            'text-overline text-sidebar-muted px-2.5 pt-1.5 pb-1',
            isCollapsed && 'sr-only',
          )}
        >
          {label}
        </div>
      )}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  )
}
