// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { NavItem } from '@surefy/ui/components/Navigation'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useSettingsNavController } from './SettingsNav.controller'

const SKELETON_ROWS = ['a', 'b', 'c']

/** The Settings area's inner navigation: a titled column with the sections the person can open. */
export default function SettingsNav({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const { items, navLabel, title, hostingLine } = useSettingsNavController({ orgSlug })

  return (
    <nav
      aria-label={navLabel}
      className="border-border bg-surface flex flex-col gap-2 rounded-xl border p-2.5 lg:w-58 lg:shrink-0 lg:self-start"
    >
      <div className="flex flex-col gap-1 px-2 pt-2 pb-1">
        <h2 className="text-object-title">{title}</h2>
        {hostingLine && (
          <span className="text-overline text-muted-foreground tracking-normal normal-case">
            {hostingLine}
          </span>
        )}
      </div>
      {items ? (
        // `NavItem` renders its own `<li>`
        <ul className="flex gap-0.5 overflow-x-auto lg:flex-col lg:overflow-visible [&>li]:shrink-0">
          {items.map((item) => (
            <NavItem
              key={item.id}
              linkComponent={Link}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={item.isActive}
            />
          ))}
        </ul>
      ) : (
        <div role="status" aria-label={navLabel} className="flex flex-col gap-2 px-2">
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-7 w-full" />
          ))}
        </div>
      )}
    </nav>
  )
}
