// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { TEST_NAV } from '@/test/navFixtures'
import { accessAs, ORG_ID, ORG_SLUG, seededShellClient } from '@/test/shell'
import { renderWithProviders } from '@surefy/web-core/testing'

import CommandMenu from './CommandMenu'
import { useShellOverlayStore } from '../../Workspace.store'

import type * as WorkspaceConstants from '../../Workspace.constants'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('../../Workspace.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceConstants>()),
  WORKSPACE_NAV: TEST_NAV,
}))

beforeEach(() => {
  push.mockReset()
  useShellOverlayStore.setState({ open: 'commands' })
})

describe('CommandMenu', () => {
  it('offers only the pages and actions the person can open', () => {
    renderWithProviders(<CommandMenu orgSlug={ORG_SLUG} />, {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(accessAs('user')),
    })
    const names = screen.getAllByRole('option').map((option) => option.textContent)
    expect(names).toEqual(['Chat', 'Notifications', 'Profile', 'New chat'])
  })

  it('goes to the chosen page and closes', async () => {
    const { user } = renderWithProviders(<CommandMenu orgSlug={ORG_SLUG} />, {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(accessAs('builder')),
    })
    await user.type(screen.getByRole('combobox'), 'agen')
    await user.keyboard('{Enter}')
    expect(push).toHaveBeenCalledWith('/acme/agents')
    expect(useShellOverlayStore.getState().open).toBeNull()
  })
})
