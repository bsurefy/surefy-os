// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ForgotPassword from './ForgotPassword'

const server = setupTestServer()

describe('ForgotPassword', () => {
  it('gives the same answer whether or not the address has an account', async () => {
    server.use(
      http.post('*/api/auth/request-password-reset', () =>
        HttpResponse.json({ code: 'USER_NOT_FOUND', message: 'nope' }, { status: 400 }),
      ),
    )
    const { user } = renderWithProviders(<ForgotPassword />, { messages: appMessages })
    await user.type(screen.getByLabelText('Email'), 'nobody@acme.test')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeVisible()
    expect(screen.getByText(/If nobody@acme.test has an account/)).toBeVisible()
    expect(screen.getByRole('button', { name: /Send again in \d+s/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
