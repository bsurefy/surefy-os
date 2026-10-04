// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import ProfileSessions from './ProfileSessions'
import { meDomain } from '../../../../../mock/handlers/me'

setupTestServer(...meDomain.handlers)

describe('ProfileSessions', () => {
  it('lists the devices with this one marked', async () => {
    renderWithProviders(<ProfileSessions />, {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(),
    })
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Safari on macOS')
    expect(items[0]).toHaveTextContent('This device')
    const [, other] = items
    if (!other) throw new Error('expected a second device')
    expect(within(other).getByRole('button', { name: 'Sign out of Safari on iOS' })).toBeVisible()
  })

  it('confirms before signing out everywhere else', async () => {
    const { user } = renderWithProviders(<ProfileSessions />, {
      orgId: ORG_ID,
      messages: appMessages,
      queryClient: seededShellClient(),
    })
    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere else' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Sign out of every other device?',
    })
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere else' }))
    expect(await screen.findByText('Every other device was signed out')).toBeVisible()
  })
})
