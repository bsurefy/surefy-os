// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, ORG_SLUG, seededShellClient } from '@/test/shell'
import { renderWithProviders } from '@surefy/web-core/testing'

import SidebarFooter from './SidebarFooter'
import { shellMe } from '../../../../../mock/handlers/shell.fixtures'

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/chat',
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

const render = (isCollapsed?: boolean) =>
  renderWithProviders(<SidebarFooter orgSlug={ORG_SLUG} isCollapsed={isCollapsed} />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('owner'), shellMe()),
  })

describe('SidebarFooter', () => {
  it('shows the organization under the person’s name instead of the role', () => {
    render()
    const button = screen.getByRole('button', { name: 'Account menu for Maya Okafor' })
    expect(button).toHaveTextContent('Maya Okafor')
    expect(button).toHaveTextContent('Acme Logistics')
    expect(button).not.toHaveTextContent('Owner')
  })

  it('keeps the avatar alone when collapsed', () => {
    render(true)
    expect(
      screen.getByRole('button', { name: 'Account menu for Maya Okafor' }),
    ).not.toHaveTextContent('Acme Logistics')
  })
})
