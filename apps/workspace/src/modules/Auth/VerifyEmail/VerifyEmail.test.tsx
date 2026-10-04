// SPDX-License-Identifier: AGPL-3.0-only
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import { savePendingEmail } from '../Auth.utils'
import VerifyEmail from './VerifyEmail'

const server = setupTestServer()

beforeEach(() => {
  sessionStorage.clear()
})

describe('VerifyEmail', () => {
  it('names the address and resends with a cooldown', async () => {
    savePendingEmail('omar@acme.test')
    server.use(
      http.post('*/api/auth/send-verification-email', () => HttpResponse.json({ status: true })),
    )
    const { user } = renderWithProviders(<VerifyEmail />, { messages: appMessages })
    expect(screen.getByText(/We sent a link to omar@acme.test/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(await screen.findByText('We sent a new link.')).toBeVisible()
    expect(screen.getByRole('button', { name: /Resend in \d+s/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('explains a link that failed', () => {
    renderWithProviders(<VerifyEmail hasLinkError />, { messages: appMessages })
    expect(screen.getByText('This link has expired')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Use a different email' })).toHaveAttribute(
      'href',
      '/signup',
    )
  })
})
