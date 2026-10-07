// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import TeamsSettings from './TeamsSettings'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import {
  resetTeamsMock,
  SALES_TEAM_ID,
  SUPPORT_TEAM_ID,
  teamsDomain,
} from '../../../../mock/handlers/teams'

setupTestServer(...teamsDomain.handlers, ...membersDomain.handlers)

function renderTeams(role: 'owner' | 'admin' = 'admin', searchParams?: string) {
  return renderWithProviders(<TeamsSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams,
  })
}

beforeEach(() => {
  resetTeamsMock()
  resetMembersMock()
})

describe('TeamsSettings', () => {
  it('lists teams with lead and counts', async () => {
    renderTeams()
    const table = await screen.findByRole('table', { name: 'Teams' })
    const support = (await within(table).findByText('Support')).closest('tr')
    expect(support).toHaveTextContent('Maya Okafor')
    expect(support).toHaveTextContent('3')
    expect(within(table).getByText('Sales')).toBeVisible()
  })

  it('creates a team and refuses a name that is taken', async () => {
    const { user } = renderTeams()
    await user.click(await screen.findByRole('button', { name: 'Create team' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create team' })
    await user.type(within(dialog).getByLabelText('Name'), 'support')
    await user.click(within(dialog).getByRole('button', { name: 'Create team' }))
    expect(await within(dialog).findByText(/already exists/)).toBeVisible()
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Success')
    await user.click(within(dialog).getByRole('button', { name: 'Create team' }))
    expect(await screen.findByText('Success was created')).toBeVisible()
    expect(await screen.findByText('Success')).toBeVisible()
  })

  it('opens the team detail from the URL with the Primary badge and Make primary team', async () => {
    renderTeams('admin', `?team=${SUPPORT_TEAM_ID}`)
    const panel = await screen.findByRole('dialog', { name: 'Support' })
    expect(await within(panel).findByText('Ana Ruiz')).toBeVisible()
    expect(within(panel).getAllByText('Primary')).toHaveLength(2)
    expect(within(panel).getAllByRole('button', { name: 'Make primary team' })).toHaveLength(1)
  })

  it('makes a team the primary team of a member', async () => {
    const { user } = renderTeams('admin', `?team=${SUPPORT_TEAM_ID}`)
    const panel = await screen.findByRole('dialog', { name: 'Support' })
    await user.click(await within(panel).findByRole('button', { name: 'Make primary team' }))
    expect(await screen.findByText("Ana Ruiz's primary team changed")).toBeVisible()
  })

  it('names who is charged elsewhere before deleting and deletes after confirming', async () => {
    const { user } = renderTeams('admin', `?team=${SALES_TEAM_ID}`)
    const panel = await screen.findByRole('dialog', { name: 'Sales' })
    await user.click(await within(panel).findByRole('button', { name: 'Delete team' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Sales?' })
    expect(await within(confirm).findByText(/has this as their primary team/)).toBeVisible()
    await user.click(within(confirm).getByRole('button', { name: 'Delete team' }))
    expect(await screen.findByText('Sales was deleted')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('Sales')).not.toBeInTheDocument()
    })
  })
})
