// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'

import { useModifierKeyLabel, useVisibleNav } from '../../Workspace.hooks'
import { useShellOverlayStore } from '../../Workspace.store'

export interface ShortcutRow {
  id: string
  keys: string[]
  description: string
}

/** The shortcut help (navigation.md §7); "g then …" rows only for modules the person sees. */
export function useShortcutsDialogController() {
  const t = useTranslations('workspace')
  const modifierKey = useModifierKeyLabel()
  const isOpen = useShellOverlayStore((state) => state.open === 'shortcuts')
  const setOpen = useShellOverlayStore((state) => state.setOpen)
  const navItems = useVisibleNav() ?? []

  const goRows: ShortcutRow[] = navItems.flatMap(({ entry }) =>
    entry.goKey
      ? [
          {
            id: `go-${entry.key}`,
            keys: ['g', entry.goKey],
            description: t('shortcuts.goTo', { module: t(`nav.items.${entry.key}`) }),
          },
        ]
      : [],
  )
  const rows: ShortcutRow[] = [
    { id: 'commands', keys: [modifierKey, 'K'], description: t('shortcuts.commandPalette') },
    { id: 'sidebar', keys: ['['], description: t('shortcuts.toggleSidebar') },
    ...goRows,
    { id: 'new', keys: ['n'], description: t('shortcuts.newItem') },
    { id: 'help', keys: ['?'], description: t('shortcuts.help') },
    { id: 'close', keys: ['Esc'], description: t('shortcuts.close') },
  ]

  return {
    isOpen,
    onOpenChange: (next: boolean) => {
      setOpen('shortcuts', next)
    },
    rows,
    then: t('shortcuts.then'),
    t,
  }
}
