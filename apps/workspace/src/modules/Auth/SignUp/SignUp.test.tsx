// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { mockOk, mockPath, renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import SignUp from './SignUp'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const server = setupTestServer()
const options = { emailPassword: true, oauthProviders: [], signupOpen: true, version: '1.0.0' }

beforeEach(() => {
  push.mockClear()
})

describe('SignUp', () => {
  it('asks for an invitation when the install does not allow sign-up', async () => {
    server.use(http.get(mockPath('/auth/options'), () => mockOk({ ...options, signupOpen: false })))
    renderWithProviders(<SignUp />, { messages: appMessages })
    expect(await screen.findByRole('heading', { name: 'Sign-up is closed' })).toBeVisible()
    expect(screen.getByText('Ask your admin for an invitation.')).toBeVisible()
  })

  it('creates the account and waits for the email to be verified', async () => {
    server.use(
      http.get(mockPath('/auth/options'), () => mockOk(options)),
      http.post('*/api/auth/sign-up/email', () =>
        HttpResponse.json({ token: null, user: { id: 'u' } }),
      ),
    )
    const { user } = renderWithProviders(<SignUp />, { messages: appMessages })
    await user.type(await screen.findByLabelText('Name'), 'Omar Haddad')
    await user.type(screen.getByLabelText('Email'), 'omar@acme.test')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/verify-email')
    })
  })

  it('says why a password is refused before anything is sent', async () => {
    server.use(http.get(mockPath('/auth/options'), () => mockOk(options)))
    const { user } = renderWithProviders(<SignUp />, { messages: appMessages })
    await user.type(await screen.findByLabelText('Name'), 'Omar Haddad')
    await user.type(screen.getByLabelText('Email'), 'omar@acme.test')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/Must be at least 12 characters/)).toBeVisible()
    expect(push).not.toHaveBeenCalled()
  })
})
