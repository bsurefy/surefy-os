// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ResetPassword from './ResetPassword'

const server = setupTestServer()

describe('ResetPassword', () => {
  it('offers a new link when the one in the email failed', () => {
    renderWithProviders(<ResetPassword hasLinkError />, { messages: appMessages })
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Send a new one' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })

  it('checks that both passwords match before sending', async () => {
    const { user } = renderWithProviders(<ResetPassword token="abc" />, { messages: appMessages })
    await user.type(screen.getByLabelText('New password'), 'correct horse battery')
    await user.type(screen.getByLabelText('Confirm new password'), 'correct horse batterX')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Passwords do not match.')).toBeVisible()
  })

  it('changes the password and points to sign in', async () => {
    server.use(http.post('*/api/auth/reset-password', () => HttpResponse.json({ status: true })))
    const { user } = renderWithProviders(<ResetPassword token="abc" />, { messages: appMessages })
    await user.type(screen.getByLabelText('New password'), 'correct horse battery')
    await user.type(screen.getByLabelText('Confirm new password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeVisible()
  })

  it('shows the expired state when the server rejects the token', async () => {
    server.use(
      http.post('*/api/auth/reset-password', () =>
        HttpResponse.json({ code: 'INVALID_TOKEN', message: 'Invalid token' }, { status: 400 }),
      ),
    )
    const { user } = renderWithProviders(<ResetPassword token="old" />, { messages: appMessages })
    await user.type(screen.getByLabelText('New password'), 'correct horse battery')
    await user.type(screen.getByLabelText('Confirm new password'), 'correct horse battery')
    await user.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByRole('heading', { name: 'This link has expired' })).toBeVisible()
  })
})
