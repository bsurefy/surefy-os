// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { CommandPalette } from '@surefy/ui/components/Overlay'

import { useCommandMenuController } from './CommandMenu.controller'

/** ⌘K / Ctrl K: go to a page or run an action. */
export default function CommandMenu({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const { isOpen, onOpenChange, groups, labels } = useCommandMenuController({ orgSlug })
  return (
    <CommandPalette open={isOpen} onOpenChange={onOpenChange} labels={labels} groups={groups} />
  )
}
