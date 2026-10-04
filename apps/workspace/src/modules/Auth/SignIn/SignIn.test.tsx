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

import SignIn from './SignIn'

const replace = vi.fn()
const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push }) }))

const server = setupTestServer()
const signInPath = '*/api/auth/sign-in/email'

const options = {
  emailPassword: true,
  oauthProviders: ['github'],
  signupOpen: true,
  version: '1.0.0',
}

beforeEach(() => {
  replace.mockClear()
  push.mockClear()
  server.use(http.get(mockPath('/auth/options'), () => mockOk(options)))
})

async function signIn(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.type(await screen.findByLabelText('Email'), 'omar@acme.test')
  await user.type(screen.getByLabelText('Password'), 'correct horse battery')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('SignIn', () => {
  it('offers the providers and sign-up the install enables', async () => {
    renderWithProviders(<SignIn />, { messages: appMessages })
    expect(await screen.findByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    )
  })

  it('explains a wrong password without saying which half was wrong', async () => {
    server.use(
      http.post(signInPath, () =>
        HttpResponse.json(
          { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
          { status: 401 },
        ),
      ),
    )
    const { user } = renderWithProviders(<SignIn />, { messages: appMessages })
    await signIn(user)
    expect(await screen.findByText('The email or password is not right.')).toBeVisible()
  })

  it('shows the locked state with the time to try again and the reset link', async () => {
    server.use(
      http.post(signInPath, () =>
        HttpResponse.json(
          { message: 'Too many requests' },
          { status: 429, headers: { 'x-retry-after': '600' } },
        ),
      ),
    )
    const { user } = renderWithProviders(<SignIn />, { messages: appMessages })
    await signIn(user)
    expect(
      await screen.findByText(/Too many attempts\. Try again at .* or reset your password\./),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Reset your password' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })

  it('sends an unverified email to the verification screen', async () => {
    server.use(
      http.post(signInPath, () =>
        HttpResponse.json(
          { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' },
          { status: 403 },
        ),
      ),
    )
    const { user } = renderWithProviders(<SignIn />, { messages: appMessages })
    await signIn(user)
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/verify-email')
    })
  })

  it('opens the only organization after signing in', async () => {
    const membership = meMembershipFactory()
    server.use(
      http.post(signInPath, () =>
        HttpResponse.json({ redirect: false, token: 't', user: { id: 'u' } }),
      ),
      http.get(mockPath('/me'), () => mockOk(meFactory({ memberships: [membership] }))),
    )
    const { user } = renderWithProviders(<SignIn />, { messages: appMessages })
    await signIn(user)
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(`/${membership.organization.slug}/chat`)
    })
  })

  it('opens the page the person asked for', async () => {
    server.use(
      http.post(signInPath, () =>
        HttpResponse.json({ redirect: false, token: 't', user: { id: 'u' } }),
      ),
    )
    const { user } = renderWithProviders(<SignIn redirect="/acme/agents" />, {
      messages: appMessages,
    })
    await signIn(user)
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/acme/agents')
    })
  })
})
