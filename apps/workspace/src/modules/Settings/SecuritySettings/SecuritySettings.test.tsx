// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import SecuritySettings from './SecuritySettings'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import {
  organizationsDomain,
  resetOrganizationsMock,
} from '../../../../mock/handlers/organizations'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

vi.mock('next/navigation', () => ({ useParams: () => ({ orgSlug: 'acme' }) }))

setupTestServer(...organizationsDomain.handlers, ...membersDomain.handlers, ...teamsDomain.handlers)

function renderSecurity() {
  return renderWithProviders(<SecuritySettings />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
  })
}

beforeEach(() => {
  resetOrganizationsMock()
  resetMembersMock()
  resetTeamsMock()
})

describe('SecuritySettings', () => {
  it('changes the session length with the save bar', async () => {
    const { user } = renderSecurity()
    await user.click(await screen.findByRole('combobox', { name: 'Session length' }))
    await user.click(await screen.findByRole('option', { name: '8 hours' }))
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Security settings saved')).toBeVisible()
  })

  it('says how many people must set up two-step verification before requiring it', async () => {
    const { user } = renderSecurity()
    await user.click(await screen.findByRole('switch', { name: /Require two-step verification/ }))
    await user.click(await screen.findByRole('button', { name: 'Save changes' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Require two-step verification?',
    })
    expect(await screen.findByText('1 member will set it up at their next sign-in.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Require it' }))
    expect(await screen.findAllByText('Security settings saved')).not.toHaveLength(0)
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument()
    })
  })

  it('shows the Enterprise sign-in features as gate cards on Community', async () => {
    renderSecurity()
    expect(await screen.findByText(/Single sign-on is part of SurefyOS/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open support access in Guard' })).toHaveAttribute(
      'href',
      '/acme/guard/support-access',
    )
  })
})
