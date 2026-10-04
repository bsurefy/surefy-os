// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import Link from 'next/link'

import { NavItem } from '@surefy/ui/components/Navigation'
import { Skeleton } from '@surefy/ui/primitives/skeleton'

import { useSettingsNavController } from './SettingsNav.controller'

const SKELETON_ROWS = ['a', 'b', 'c']

/** The Settings area's inner navigation: the sections the person can open, in design order. */
export default function SettingsNav({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const { items, navLabel } = useSettingsNavController({ orgSlug })

  return (
    <nav aria-label={navLabel} className="lg:w-56 lg:shrink-0">
      {items ? (
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {items.map((item) => (
            <li key={item.id} className="shrink-0">
              <NavItem
                linkComponent={Link}
                href={item.href}
                label={item.label}
                isActive={item.isActive}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div role="status" aria-label={navLabel} className="flex flex-col gap-2">
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-7 w-full" />
          ))}
        </div>
      )}
    </nav>
  )
}
