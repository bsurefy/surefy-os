// SPDX-License-Identifier: AGPL-3.0-only
import { Bell, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import type { CommandPaletteGroup, CommandPaletteItem } from '@surefy/ui/components/Overlay'

import { WORKSPACE_COMMANDS } from '../../Workspace.commands'
import { useNavContext, useVisibleNav } from '../../Workspace.hooks'
import { useShellOverlayStore } from '../../Workspace.store'
import { isCommandAvailable, toRoute } from '../../Workspace.utils'

import type { CommandGroup, NavItemKey, WorkspaceCommand } from '../../Workspace.types'

/**
 * The command palette (navigation.md §4): "Go to" the visible modules, the personal pages and the
 * modules' own entries, then the modules' "Actions". Only what the person can use is listed.
 */
export function useCommandMenuController({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations('workspace')
  const tAll = useTranslations()
  const router = useRouter()
  const isOpen = useShellOverlayStore((state) => state.open === 'commands')
  const setOpen = useShellOverlayStore((state) => state.setOpen)
  const context = useNavContext()
  const navItems = useVisibleNav() ?? []

  const go = (href: string) => () => {
    router.push(toRoute(href))
  }

  const visibleKeys = new Set<NavItemKey>(navItems.map((item) => item.entry.key))
  const moduleCommands = context
    ? WORKSPACE_COMMANDS.filter((command) => isCommandAvailable(command, visibleKeys, context))
    : []
  // Full keys from each module's namespace; the module owns the text
  const toItem = (command: WorkspaceCommand): CommandPaletteItem => ({
    id: command.id,
    label: tAll(command.labelKey as never),
    icon: command.icon,
    onSelect: go(command.href(orgSlug)),
  })
  const byGroup = (group: CommandGroup) =>
    moduleCommands.filter((command) => command.group === group).map(toItem)

  const goTo: CommandPaletteItem[] = [
    ...navItems.map(({ entry }) => ({
      id: `nav-${entry.key}`,
      label: t(`nav.items.${entry.key}`),
      icon: entry.icon,
      onSelect: go(entry.href(orgSlug)),
    })),
    ...byGroup('goTo'),
    {
      id: 'notifications',
      label: t('notifications.title'),
      icon: Bell,
      onSelect: go(ROUTES.workspace.notifications(orgSlug)),
    },
    {
      id: 'profile',
      label: t('profile.title'),
      icon: UserRound,
      onSelect: go(ROUTES.workspace.profile(orgSlug)),
    },
  ]
  const actions = byGroup('actions')
  const groups: CommandPaletteGroup[] = [
    { heading: t('commands.groups.goTo'), items: goTo },
    ...(actions.length > 0 ? [{ heading: t('commands.groups.actions'), items: actions }] : []),
  ]

  return {
    isOpen,
    onOpenChange: (next: boolean) => {
      setOpen('commands', next)
    },
    groups,
    labels: {
      title: t('commands.title'),
      description: t('commands.description'),
      placeholder: t('commands.placeholder'),
      empty: (query: string) => t('commands.empty', { query }),
    },
  }
}
