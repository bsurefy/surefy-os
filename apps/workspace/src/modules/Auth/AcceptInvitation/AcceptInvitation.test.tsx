// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import type { InvitationPreviewDto } from '@surefy/contracts'
import { mockOk, mockPath, renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import AcceptInvitation from './AcceptInvitation'

import type { AcceptInvitationProps } from './AcceptInvitation.types'

const replace = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push, refresh: vi.fn() }) }))

const server = setupTestServer()
const TOKEN = 'a'.repeat(43)

const pending: InvitationPreviewDto = {
  organization: { name: 'Acme Logistics', slug: 'acme', logoUrl: null },
  role: 'builder',
  email: 'omar@acme.test',
  inviterName: 'Maya Okafor',
  status: 'pending',
  expiresAt: '2026-10-11T10:00:00.000Z',
  requiresTwoFactor: false,
}

function renderInvitation(props: Partial<AcceptInvitationProps> = {}) {
  return renderWithProviders(
    <AcceptInvitation token={TOKEN} invitation={pending} signedInAs={null} {...props} />,
    { messages: appMessages },
  )
}

beforeEach(() => {
  replace.mockClear()
  push.mockClear()
})

describe('AcceptInvitation', () => {
  it('says who invited the person and to which role', () => {
    renderInvitation()
    expect(screen.getByRole('heading', { name: 'Join Acme Logistics' })).toBeVisible()
    expect(
      screen.getByText('Join Acme Logistics as Builder · invited by Maya Okafor'),
    ).toBeVisible()
    expect(screen.getByLabelText('Email')).toHaveValue('omar@acme.test')
  })

  it('creates the account for the invited address and waits for verification', async () => {
    server.use(
      http.post('*/api/auth/sign-up/email', () =>
        HttpResponse.json({ token: null, user: { id: 'u' } }),
      ),
    )
    const { user } = renderInvitation()
    await user.type(screen.getByLabelText('Name'), 'Omar Haddad')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create account and join' }))
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/verify-email')
    })
  })

  it('lets the matching signed-in account join', async () => {
    server.use(
      http.post(mockPath(`/invitations/${TOKEN}/accept`), () =>
        mockOk({
          organization: {
            id: '0191a000-0000-7000-8000-000000000001',
            name: 'Acme Logistics',
            slug: 'acme',
            logoUrl: null,
          },
          memberId: '0191a000-0000-7000-8000-000000000002',
        }),
      ),
    )
    const { user } = renderInvitation({
      signedInAs: { email: 'Omar@acme.test', isTwoFactorEnabled: false },
    })
    await user.click(screen.getByRole('button', { name: 'Join organization' }))
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/acme/chat')
    })
  })

  it('offers to switch account when signed in with another address', () => {
    renderInvitation({ signedInAs: { email: 'omar@other.test', isTwoFactorEnabled: false } })
    expect(screen.getByText("You're signed in as omar@other.test")).toBeVisible()
    expect(screen.getByRole('button', { name: 'Switch account' })).toBeVisible()
  })

  it('asks for two-step verification first when the organization requires it', () => {
    renderInvitation({
      invitation: { ...pending, requiresTwoFactor: true },
      signedInAs: { email: 'omar@acme.test', isTwoFactorEnabled: false },
    })
    expect(screen.getByRole('link', { name: 'Set up two-step verification' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Join organization' })).not.toBeInTheDocument()
  })

  it('lets the person ask the inviter for a new invitation when it expired', async () => {
    server.use(
      http.post(
        mockPath(`/invitations/${TOKEN}/request-reissue`),
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const { user } = renderInvitation({ invitation: { ...pending, status: 'expired' } })
    expect(screen.getByRole('heading', { name: 'This invitation has expired' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Ask Maya Okafor for a new invite' }))
    expect(await screen.findByText('We let Maya Okafor know.')).toBeVisible()
  })

  it('shows the not-found state for a link that matches nothing', () => {
    renderInvitation({ invitation: null })
    expect(screen.getByRole('heading', { name: 'This invitation is not valid' })).toBeVisible()
  })
})
