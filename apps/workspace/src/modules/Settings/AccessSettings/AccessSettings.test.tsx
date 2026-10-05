// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import AccessSettings from './AccessSettings'
import { accessDomain } from '../../../../mock/handlers/access'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

setupTestServer(...accessDomain.handlers, ...membersDomain.handlers, ...teamsDomain.handlers)

function renderAccess(features: string[] = []) {
  return renderWithProviders(<AccessSettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('owner', { features: features as never })),
  })
}

beforeEach(() => {
  resetMembersMock()
  resetTeamsMock()
})

describe('AccessSettings', () => {
  it('shows what each role can do by default', () => {
    renderAccess()
    const table = screen.getByRole('table', { name: 'Capabilities by role' })
    const invite = within(table).getByText('Invite people').closest('tr')
    if (!invite) throw new Error('expected the invite row')
    const [, user, , admin] = within(invite).getAllByRole('cell')
    if (!user || !admin) throw new Error('expected a cell per role')
    expect(within(user).getByText('Not allowed')).toBeInTheDocument()
    expect(within(admin).getByText('Allowed')).toBeInTheDocument()
  })

  it('explains why something is off for a chosen person, with a link to change it', async () => {
    const { user } = renderAccess()
    await user.click(await screen.findByRole('combobox', { name: 'Person or team' }))
    await user.click(await screen.findByRole('option', { name: /Omar Haddad/ }))
    expect(await screen.findByRole('heading', { name: 'Modules' })).toBeVisible()
    expect(await screen.findByText(/The train module is off · Set by a team/)).toBeVisible()
    expect(screen.getAllByRole('link', { name: 'Change' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Unlimited').length).toBeGreaterThan(0)
  })

  it('looks up a team as well', async () => {
    const { user } = renderAccess()
    await user.click(screen.getByRole('radio', { name: 'Team' }))
    await user.click(await screen.findByRole('combobox', { name: 'Person or team' }))
    await user.click(await screen.findByRole('option', { name: 'Support' }))
    expect(await screen.findByRole('heading', { name: 'Limits' })).toBeVisible()
  })

  it('shows the custom roles card where the feature is not available', () => {
    renderAccess()
    expect(screen.getByRole('heading', { name: /Custom roles/ })).toBeVisible()
  })
})
