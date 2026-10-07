// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { cn } from '../../../lib/utils'

import type { TabItem, TabsProps } from './Tabs.types'

const tabClass =
  'relative -mb-px inline-flex h-10 items-center gap-2 border-b-2 border-transparent text-body font-medium text-foreground-secondary transition-colors duration-fast hover:text-foreground aria-selected:border-primary aria-selected:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground'

function TabLabel({ item }: Readonly<{ item: TabItem }>) {
  return (
    <>
      {item.label}
      {item.count !== undefined && (
        <span className="bg-surface-2 text-caption text-foreground-secondary rounded-full px-1.5 tabular-nums">
          {item.count}
        </span>
      )}
    </>
  )
}

/**
 * Underline tabs for the views of one object (14px label, 24px gap, count badge). Route tabs render
 * links with aria-current; in-page tabs render a tab list.
 */
export default function Tabs({
  items,
  value,
  onValueChange,
  label,
  linkComponent: Link = 'a',
  className,
}: Readonly<TabsProps>) {
  const isRoute = items.every((item) => item.href)
  if (isRoute) {
    return (
      <nav
        aria-label={label}
        className={cn('border-border flex gap-6 overflow-x-auto border-b', className)}
      >
        {items.map((item) => (
          <Link
            key={item.value}
            href={item.href}
            aria-current={item.value === value ? 'page' : undefined}
            className={tabClass}
          >
            <TabLabel item={item} />
          </Link>
        ))}
      </nav>
    )
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('border-border flex gap-6 overflow-x-auto border-b', className)}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          tabIndex={item.value === value ? 0 : -1}
          onClick={() => onValueChange?.(item.value)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
            const index = items.findIndex((tab) => tab.value === value)
            const next =
              items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]
            if (next) onValueChange?.(next.value)
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')
            buttons?.[items.indexOf(next ?? item)]?.focus()
          }}
          className={tabClass}
        >
          <TabLabel item={item} />
        </button>
      ))}
    </div>
  )
}
