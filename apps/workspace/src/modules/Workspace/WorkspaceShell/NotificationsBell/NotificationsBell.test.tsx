// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { ORG_ID, ORG_SLUG, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import NotificationsBell from './NotificationsBell'
import {
  notificationsDomain,
  resetNotificationsMock,
} from '../../../../../mock/handlers/notifications'

setupTestServer(...notificationsDomain.handlers)

function renderBell() {
  return renderWithProviders(<NotificationsBell orgSlug={ORG_SLUG} />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(),
  })
}

beforeEach(() => {
  resetNotificationsMock()
})

describe('NotificationsBell', () => {
  it('names the unread count and lists the latest items with a link to all', async () => {
    const { user } = renderBell()
    const bell = await screen.findByRole('button', { name: 'Notifications, 3 unread' })
    await user.click(bell)
    expect(await screen.findByText('An action is waiting for your approval')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'See all notifications' })).toHaveAttribute(
      'href',
      '/acme/notifications',
    )
  })

  it('clears the count after marking everything read', async () => {
    const { user } = renderBell()
    await user.click(await screen.findByRole('button', { name: 'Notifications, 3 unread' }))
    await user.click(await screen.findByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    })
  })
})
