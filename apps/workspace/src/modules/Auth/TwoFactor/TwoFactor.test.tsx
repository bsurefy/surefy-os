// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
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

import TwoFactor from './TwoFactor'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const server = setupTestServer()

beforeEach(() => {
  replace.mockClear()
})

describe('TwoFactor', () => {
  it('verifies the code as soon as the sixth digit is in and opens the organization', async () => {
    const membership = meMembershipFactory()
    server.use(
      http.post('*/api/auth/two-factor/verify-totp', () =>
        HttpResponse.json({ token: 't', user: { id: 'u' } }),
      ),
      http.get(mockPath('/me'), () => mockOk(meFactory({ memberships: [membership] }))),
    )
    const { user } = renderWithProviders(<TwoFactor />, { messages: appMessages })
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(`/${membership.organization.slug}/chat`)
    })
  })

  it('says when the code is wrong', async () => {
    server.use(
      http.post('*/api/auth/two-factor/verify-totp', () =>
        HttpResponse.json({ code: 'INVALID_CODE', message: 'Invalid code' }, { status: 401 }),
      ),
    )
    const { user } = renderWithProviders(<TwoFactor />, { messages: appMessages })
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    expect(await screen.findByText(/That code is not right/)).toBeVisible()
  })

  it('switches to a recovery code and back', async () => {
    const { user } = renderWithProviders(<TwoFactor />, { messages: appMessages })
    await user.click(screen.getByRole('button', { name: 'Use a recovery code' }))
    expect(screen.getByLabelText('Recovery code')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Use the authenticator code' }))
    expect(screen.getByLabelText('6-digit code')).toBeVisible()
  })

  it('sends the person back to sign in when the sign-in timed out', async () => {
    server.use(
      http.post('*/api/auth/two-factor/verify-totp', () =>
        HttpResponse.json({ code: 'INVALID_TWO_FACTOR_COOKIE', message: 'x' }, { status: 401 }),
      ),
    )
    const { user } = renderWithProviders(<TwoFactor />, { messages: appMessages })
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    expect(await screen.findByRole('heading', { name: 'Your sign-in timed out' })).toBeVisible()
  })
})
