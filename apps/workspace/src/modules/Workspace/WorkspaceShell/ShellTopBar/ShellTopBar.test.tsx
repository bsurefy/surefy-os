// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, ORG_SLUG, seededShellClient } from '@/test/shell'
import { renderWithProviders } from '@surefy/web-core/testing'

import ShellTopBar from './ShellTopBar'
import { shellMe } from '../../../../../mock/handlers/shell.fixtures'

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/chat',
  useSelectedLayoutSegments: () => ['chat'],
}))

const render = (isSidebarCollapsed: boolean, onToggleSidebar = vi.fn()) => {
  const view = renderWithProviders(
    <ShellTopBar
      orgSlug={ORG_SLUG}
      isSidebarCollapsed={isSidebarCollapsed}
      onToggleSidebar={onToggleSidebar}
    />,
    {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(accessAs('owner'), shellMe()),
    },
  )
  return { ...view, onToggleSidebar }
}

describe('ShellTopBar: sidebar toggle', () => {
  it('collapses the sidebar from the icon in the top bar', async () => {
    const { user, onToggleSidebar } = render(false)
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(toggle).toHaveAttribute('aria-keyshortcuts', '[')
    await user.click(toggle)
    expect(onToggleSidebar).toHaveBeenCalledOnce()
  })

  it('offers to expand it while collapsed', () => {
    render(true)
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
  })
})
