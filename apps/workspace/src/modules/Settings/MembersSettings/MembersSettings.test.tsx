// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { mockError, mockPath, renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import MembersSettings from './MembersSettings'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

const server = setupTestServer(...membersDomain.handlers, ...teamsDomain.handlers)

function renderMembers(role: 'owner' | 'admin' | 'builder' = 'owner', searchParams?: string) {
  return renderWithProviders(<MembersSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams,
  })
}

beforeEach(() => {
  resetMembersMock()
  resetTeamsMock()
})

describe('MembersSettings', () => {
  it('lists pending invitations first, then people with role, teams and status', async () => {
    renderMembers()
    const table = await screen.findByRole('table', { name: 'Members' })
    expect(await within(table).findByText('priya@acme.test')).toBeVisible()
    expect(within(table).getByText('Maya Okafor')).toBeVisible()
    expect(within(table).getByText('Not delivered')).toBeVisible()
    expect(within(table).getAllByText('Support').length).toBeGreaterThan(0)
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('priya@acme.test')
  })

  it('narrows the table with the status filter in the URL', async () => {
    renderMembers('owner', '?status=deactivated')
    const table = await screen.findByRole('table', { name: 'Members' })
    expect(await within(table).findByText('Lee Chen')).toBeVisible()
    expect(within(table).queryByText('Maya Okafor')).not.toBeInTheDocument()
    expect(within(table).queryByText('priya@acme.test')).not.toBeInTheDocument()
  })

  it('invites several people, one request each, and reports each', async () => {
    const { user } = renderMembers()
    await user.click(await screen.findByRole('button', { name: 'Invite people' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invite people' })
    await user.type(
      within(dialog).getByLabelText('Email addresses'),
      'new1@acme.test, maya@acme.test',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Send 2 invitations' }))
    expect(await within(dialog).findByText('new1@acme.test')).toBeVisible()
    expect(within(dialog).getByText('Invitation created')).toBeVisible()
    expect(within(dialog).getByText(/already a member/i)).toBeVisible()
  })

  it('stops inviting when the seat limit is reached', async () => {
    server.use(
      http.post(mockPath('/orgs/:orgId/invitations'), () =>
        mockError(403, 'LIMIT_REACHED', 'Seat limit'),
      ),
    )
    const { user } = renderMembers()
    await user.click(await screen.findByRole('button', { name: 'Invite people' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invite people' })
    await user.type(within(dialog).getByLabelText('Email addresses'), 'a@acme.test b@acme.test')
    await user.click(within(dialog).getByRole('button', { name: 'Send 2 invitations' }))
    expect(await within(dialog).findAllByText(/limit for this has been reached/)).not.toHaveLength(
      0,
    )
    expect(within(dialog).queryByText('b@acme.test')).not.toBeInTheDocument()
  })

  it('confirms a promotion with its impact before changing the role', async () => {
    const { user } = renderMembers()
    const table = await screen.findByRole('table', { name: 'Members' })
    await user.click(await within(table).findByRole('button', { name: 'Actions for Omar Haddad' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Change role' }))
    const dialog = await screen.findByRole('dialog', { name: 'Change role for Omar Haddad' })
    await user.click(within(dialog).getByRole('radio', { name: /Admin/ }))
    expect(within(dialog).getByText(/access to more of the organization/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Change role' }))
    expect(await screen.findByText('Omar Haddad is now Admin')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('does not let an admin touch an owner', async () => {
    renderMembers('admin')
    const table = await screen.findByRole('table', { name: 'Members' })
    await within(table).findByText('Maya Okafor')
    expect(
      within(table).queryByRole('button', { name: 'Actions for Maya Okafor' }),
    ).not.toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Actions for Omar Haddad' })).toBeVisible()
  })

  it('shows the table without actions or invite for someone who may only read', async () => {
    renderMembers('builder')
    const table = await screen.findByRole('table', { name: 'Members' })
    await within(table).findByText('Maya Okafor')
    expect(screen.queryByRole('button', { name: 'Invite people' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
  })

  it('removes a person after naming who takes over their work', async () => {
    const { user } = renderMembers()
    const table = await screen.findByRole('table', { name: 'Members' })
    await user.click(await within(table).findByRole('button', { name: 'Actions for Omar Haddad' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from organization' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove Omar Haddad?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove person' }))
    expect(await screen.findByText('Omar Haddad was removed')).toBeVisible()
  })
})
