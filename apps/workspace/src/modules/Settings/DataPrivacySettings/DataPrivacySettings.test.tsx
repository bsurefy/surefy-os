// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { mockPage, mockPath, renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import DataPrivacySettings from './DataPrivacySettings'
import {
  dataControlDomain,
  dataRequestFactory,
  resetDataControlMock,
} from '../../../../mock/handlers/dataControl'
import {
  organizationsDomain,
  resetOrganizationsMock,
} from '../../../../mock/handlers/organizations'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

const server = setupTestServer(...dataControlDomain.handlers, ...organizationsDomain.handlers)

function renderPage(role: 'owner' | 'admin' = 'owner') {
  return renderWithProviders(<DataPrivacySettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
  })
}

beforeEach(() => {
  resetDataControlMock()
  resetOrganizationsMock()
})

describe('DataPrivacySettings', () => {
  it('says where data is stored and how long each kind is kept', async () => {
    renderPage()
    expect(await screen.findByText('Your data is stored on your server.')).toBeVisible()
    expect(screen.getByText('365 days')).toBeVisible()
    expect(screen.getByText('Until someone deletes it')).toBeVisible()
  })

  it('switches chat sharing off at once', async () => {
    const { user } = renderPage()
    const toggle = await screen.findByRole('switch', { name: /Chat sharing/ })
    await user.click(toggle)
    expect(await screen.findByText('Privacy settings saved')).toBeVisible()
  })

  it('warns about personal data before an export and follows it until it is ready', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Request export' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Export all data?' })
    expect(within(dialog).getByText(/contains personal data/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Request export' }))
    expect(await screen.findByText('Export requested')).toBeVisible()
    expect(await screen.findByText('Ready')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download' })).toBeVisible()
  })

  it('lets only owners export or delete', async () => {
    renderPage('admin')
    await screen.findByText('Your data is stored on your server.')
    expect(screen.queryByRole('button', { name: 'Request export' })).not.toBeInTheDocument()
    expect(screen.getByText('Only owners can export all data.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Delete organization' })).not.toBeInTheDocument()
  })

  it('offers to retry a failed export', async () => {
    server.use(
      http.get(mockPath('/orgs/:orgId/data-requests'), () =>
        mockPage([dataRequestFactory({ status: 'failed', sizeBytes: null, expiresAt: null })]),
      ),
    )
    renderPage()
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible()
  })

  it('needs the typed name and a reason to delete, then shows the 30-day hold with a way to cancel', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Delete organization' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Acme Logistics?' })
    await user.type(within(dialog).getByLabelText('Reason'), 'We are closing')
    await user.type(
      within(dialog).getByLabelText(/Type Acme Logistics to confirm/),
      'Acme Logistics',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Delete organization' }))
    expect(await screen.findByText(/Deletion is scheduled for/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Cancel deletion' }))
    expect(await screen.findByText('Deletion canceled')).toBeVisible()
  })
})
