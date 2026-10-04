// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { ORG_ID, ORG_SLUG, seededShellClient } from '@/test/shell'
import { ERROR_CODES } from '@surefy/contracts'
import {
  mockError,
  mockPage,
  mockPath,
  renderWithProviders,
  setupTestServer,
} from '@surefy/web-core/testing'

import NotificationCenter from './NotificationCenter'
import {
  notificationsDomain,
  resetNotificationsMock,
} from '../../../../mock/handlers/notifications'

const server = setupTestServer(...notificationsDomain.handlers)
const listPath = mockPath('/orgs/:orgId/notifications')

function renderCenter(searchParams?: string) {
  return renderWithProviders(<NotificationCenter orgId={ORG_ID} orgSlug={ORG_SLUG} />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(),
    searchParams,
  })
}

beforeEach(() => {
  resetNotificationsMock()
})

describe('NotificationCenter', () => {
  it('lists notifications newest first, unread ones marked', async () => {
    renderCenter()
    const list = await screen.findByRole('list', { name: 'Notifications' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(7)
    expect(items[0]).toHaveTextContent('An action is waiting for your approval')
    expect(items[0]).toHaveTextContent('Unread')
    expect(within(list).getByRole('link', { name: /waiting for your approval/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\/insights\/approvals\//),
    )
  })

  it('marks one or every notification read', async () => {
    const { user } = renderCenter()
    await screen.findByRole('list', { name: 'Notifications' })
    const [first] = screen.getAllByRole('button', { name: 'Mark as read' })
    if (!first) throw new Error('expected an unread notification')
    await user.click(first)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(2)
    })
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull()
    })
  })

  it('offers all notifications when nothing is unread', async () => {
    server.use(http.get(listPath, () => mockPage([])))
    const { user } = renderCenter('?show=unread')
    expect(await screen.findByRole('heading', { name: 'No unread notifications' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Show all' }))
  })

  it('says so when there is nothing yet', async () => {
    server.use(http.get(listPath, () => mockPage([])))
    renderCenter()
    expect(await screen.findByRole('heading', { name: "You're all caught up" })).toBeVisible()
  })

  it('shows the error with its request ID', async () => {
    server.use(http.get(listPath, () => mockError(500, ERROR_CODES.INTERNAL_ERROR, 'Broken')))
    renderCenter()
    expect(
      await screen.findByRole('heading', { name: "Couldn't load notifications" }),
    ).toBeVisible()
    expect(screen.getByText(/req_mock_/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
