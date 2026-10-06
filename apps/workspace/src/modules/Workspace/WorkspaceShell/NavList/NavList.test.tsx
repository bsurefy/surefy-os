// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { TEST_NAV } from '@/test/navFixtures'
import { accessAs, ORG_ID, ORG_SLUG, seededShellClient } from '@/test/shell'
import { TooltipProvider } from '@surefy/ui/primitives/tooltip'
import { renderWithProviders } from '@surefy/web-core/testing'

import NavList from './NavList'

import type * as WorkspaceConstants from '../../Workspace.constants'

vi.mock('next/navigation', () => ({ usePathname: () => '/acme/agents/a1' }))
vi.mock('../../Workspace.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceConstants>()),
  WORKSPACE_NAV: TEST_NAV,
}))

function renderNav(role: Parameters<typeof accessAs>[0], isCollapsed = false) {
  return renderWithProviders(
    <TooltipProvider>
      <NavList orgSlug={ORG_SLUG} isCollapsed={isCollapsed} />
    </TooltipProvider>,
    { orgId: ORG_ID, messages: appMessages, queryClient: seededShellClient(accessAs(role)) },
  )
}

const linkNames = () => screen.getAllByRole('link').map((link) => link.textContent)

describe('NavList', () => {
  it('shows a User only Chat', () => {
    renderNav('user')
    expect(linkNames()).toEqual(['Chat'])
  })

  it('shows a Builder the build modules, never unreleased ones', () => {
    renderNav('builder')
    expect(linkNames()).toEqual(['Chat', 'Agents'])
    expect(screen.queryByRole('link', { name: /Flows/ })).toBeNull()
  })

  it('groups the items of an Owner and locks the gated one with its edition', () => {
    renderNav('owner')
    const operate = screen.getByRole('group', { name: 'Operate' })
    const guard = within(operate).getByRole('link', { name: /Guard/ })
    expect(guard).toHaveTextContent('Enterprise')
    expect(within(operate).getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('keeps Settings inside Operate as a dropdown of the sections the person may open', async () => {
    const { user } = renderNav('owner')
    const operate = screen.getByRole('group', { name: 'Operate' })
    const trigger = within(operate).getByRole('button', { name: 'Settings' })
    expect(screen.getAllByRole('group')).toHaveLength(2)
    // closed on a page outside Settings
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'General' })).toBeNull()
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute(
      'href',
      '/acme/settings/general',
    )
    expect(screen.getByRole('link', { name: /Vault.*Keys & models/ })).toHaveAttribute(
      'href',
      '/acme/settings/vault',
    )
    await user.click(trigger)
    expect(screen.queryByRole('link', { name: 'General' })).toBeNull()
  })

  it('offers the sections from a menu on the icon rail', async () => {
    const { user } = renderNav('owner', true)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByRole('menuitem', { name: 'General' })).toHaveAttribute(
      'href',
      '/acme/settings/general',
    )
  })

  it('marks the module of the current page', () => {
    renderNav('owner')
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Chat' })).not.toHaveAttribute('aria-current')
  })

  it('keeps labels as accessible names when collapsed', () => {
    renderNav('builder', true)
    expect(screen.getByRole('link', { name: 'Agents' })).toBeInTheDocument()
  })
})
