// SPDX-License-Identifier: AGPL-3.0-only
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { useMediaQuery } from '@surefy/ui/hooks/useMediaQuery'

import { DESKTOP_MEDIA_QUERY } from '../Workspace.constants'
import { useVisibleNav } from '../Workspace.hooks'
import { useSidebarStore } from '../Workspace.store'
import { useShellShortcuts } from './WorkspaceShell.shortcuts'

import type { WorkspaceShellProps } from './WorkspaceShell.types'

/**
 * The frame's state: the sidebar is expanded from 1280px and collapsed below, unless the person
 * chose otherwise on this device (layout-and-responsive.md §2).
 */
export function useWorkspaceShellController({ orgSlug }: Pick<WorkspaceShellProps, 'orgSlug'>) {
  const t = useTranslations('workspace.shell')
  const tCommon = useTranslations('common')
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const preference = useSidebarStore((state) => state.collapsedPreference)
  const toggle = useSidebarStore((state) => state.toggle)
  const navItems = useVisibleNav()

  // Persisted stores rehydrate after mount, so the server HTML and the first render agree
  useEffect(() => {
    void useSidebarStore.persist.rehydrate()
  }, [])

  const isCollapsed = preference ?? !isDesktop
  const onToggleSidebar = () => {
    toggle(isCollapsed)
  }
  useShellShortcuts({ orgSlug, navItems: navItems ?? [], onToggleSidebar })

  return { isCollapsed, onToggleSidebar, productName: tCommon('productName'), t }
}
