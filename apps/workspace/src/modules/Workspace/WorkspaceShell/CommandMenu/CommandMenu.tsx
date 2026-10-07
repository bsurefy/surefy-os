// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CommandPalette } from '@surefy/ui/components/Overlay'
import { Kbd } from '@surefy/ui/primitives/kbd'

import { useCommandMenuController } from './CommandMenu.controller'

/** ⌘K / Ctrl K: go to a page or run an action. */
export default function CommandMenu({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const { isOpen, onOpenChange, groups, labels, hints } = useCommandMenuController({ orgSlug })
  return (
    <CommandPalette
      open={isOpen}
      onOpenChange={onOpenChange}
      labels={labels}
      groups={groups}
      footer={hints.map((hint) => (
        <span key={hint.label} className="flex items-center gap-1.5">
          <span className="flex gap-0.5">
            {hint.keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </span>
          {hint.label}
        </span>
      ))}
    />
  )
}
