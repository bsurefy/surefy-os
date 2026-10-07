// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { BrandMark } from '@surefy/ui/components/DataDisplay'
import { AppShell } from '@surefy/ui/components/Layout'
import { Sidebar } from '@surefy/ui/components/Navigation'

import CommandMenu from './CommandMenu'
import MobileNav from './MobileNav'
import NavList from './NavList'
import ShellBanners from './ShellBanners'
import ShellTopBar from './ShellTopBar'
import ShortcutsDialog from './ShortcutsDialog'
import SidebarFooter from './SidebarFooter'
import { useWorkspaceShellController } from './WorkspaceShell.controller'

import type { WorkspaceShellProps } from './WorkspaceShell.types'

/**
 * The workspace frame around every organization page: banners, sidebar, top bar, command
 * palette, shortcut help and the mobile menu. Pages render inside `<main id="main">`.
 */
export default function WorkspaceShell({ orgSlug, children }: Readonly<WorkspaceShellProps>) {
  const { isCollapsed, onToggleSidebar, width, productName, t } = useWorkspaceShellController({
    orgSlug,
  })

  return (
    <>
      <a
        href="#main"
        className="bg-background text-label focus-visible:ring-ring sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-2"
      >
        {t('skipToContent')}
      </a>
      <AppShell
        banner={<ShellBanners />}
        sidebar={
          <Sidebar
            label={t('navLabel')}
            isCollapsed={isCollapsed}
            brand={
              <BrandMark
                label={productName}
                wordmark={isCollapsed ? undefined : t('brand.wordmark')}
                accent={isCollapsed ? undefined : t('brand.accent')}
              />
            }
            footer={<SidebarFooter orgSlug={orgSlug} isCollapsed={isCollapsed} />}
          >
            <NavList orgSlug={orgSlug} isCollapsed={isCollapsed} />
          </Sidebar>
        }
        topBar={
          <ShellTopBar
            orgSlug={orgSlug}
            isSidebarCollapsed={isCollapsed}
            onToggleSidebar={onToggleSidebar}
          />
        }
        width={width}
      >
        {children}
      </AppShell>
      <MobileNav orgSlug={orgSlug} />
      <CommandMenu orgSlug={orgSlug} />
      <ShortcutsDialog />
    </>
  )
}
