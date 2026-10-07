// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import {
  meFactory,
  meMembershipFactory,
  mockOk,
  mockPath,
  renderWithProviders,
  setupTestServer,
} from '@surefy/web-core/testing'

import ChooseOrganization from './ChooseOrganization'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const server = setupTestServer()

beforeEach(() => {
  push.mockClear()
})

describe('ChooseOrganization', () => {
  it('opens the chosen organization and remembers it', async () => {
    const memberships = [meMembershipFactory(), meMembershipFactory()]
    const [, second] = memberships
    if (!second) throw new Error('expected two memberships')
    let remembered: unknown
    server.use(
      http.patch(mockPath('/me'), async ({ request }) => {
        remembered = await request.json()
        return mockOk(meFactory({ memberships }))
      }),
    )
    const { user } = renderWithProviders(<ChooseOrganization memberships={memberships} />, {
      messages: appMessages,
    })
    await user.click(screen.getByRole('button', { name: new RegExp(second.organization.name) }))
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/${second.organization.slug}/chat`)
    })
    expect(remembered).toEqual({ lastOrganizationId: second.organization.id })
  })
})
