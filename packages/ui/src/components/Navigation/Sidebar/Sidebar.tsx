// SPDX-License-Identifier: AGPL-3.0-only
import { useId } from 'react'

import { cn } from '../../../lib/utils'

import type { SidebarGroupProps, SidebarProps } from './Sidebar.types'

/** Sidebar frame: 248px open, 64px collapsed (docs/design/shared/components.md, Navigation). */
export default function Sidebar({
  isCollapsed = false,
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
      {header && <div className="flex h-14 shrink-0 items-center px-3">{header}</div>}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-2">{children}</div>
      {footer && <div className="border-sidebar-border shrink-0 border-t p-3">{footer}</div>}
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
          className={cn('text-overline text-sidebar-muted px-2 pb-1', isCollapsed && 'sr-only')}
        >
          {label}
        </div>
      )}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  )
}
