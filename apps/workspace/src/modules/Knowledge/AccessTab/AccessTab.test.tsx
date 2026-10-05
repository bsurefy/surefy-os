// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import {
  HELP_CENTER_ID,
  HR_POLICIES_ID,
  knowledgeDomain,
  resetKnowledgeMock,
} from '../../../../mock/handlers/knowledge'
import { membersDomain, resetMembersMock } from '../../../../mock/handlers/members'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import KnowledgeBaseDetail from '../KnowledgeBaseDetail'

let mockParams: { orgSlug: string; kbId: string; tab?: string }

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: vi.fn() }),
}))

const server = setupTestServer(
  ...knowledgeDomain.handlers,
  ...teamsDomain.handlers,
  ...membersDomain.handlers,
)

function renderAccess(kbId = HELP_CENTER_ID) {
  mockParams = { orgSlug: 'acme', kbId, tab: 'access' }
  return renderWithProviders(<KnowledgeBaseDetail />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
  })
}

beforeEach(() => {
  resetKnowledgeMock()
  resetTeamsMock()
  resetMembersMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('AccessTab', () => {
  it('lists the teams with their level and the people with their own grant', async () => {
    renderAccess()
    const support = await screen.findByRole('combobox', { name: 'Access for Support' })
    expect(support).toHaveTextContent('Can search')
    expect(screen.getByRole('combobox', { name: 'Access for Sales' })).toHaveTextContent(
      'No access',
    )
    expect(screen.getByText('Omar Haddad')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Access for Omar Haddad' })).toHaveTextContent(
      'Can manage',
    )
    expect(screen.getByText(/Can manage applies to the team's Builders and above/)).toBeVisible()
  })

  it('gives a team access at once', async () => {
    const { user } = renderAccess()
    await user.click(await screen.findByRole('combobox', { name: 'Access for Sales' }))
    await user.click(await screen.findByRole('option', { name: 'Can manage' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Access for Sales' })).toHaveTextContent(
        'Can manage',
      )
    })
  })

  it('confirms removing a team, naming the people and the agents affected', async () => {
    const { user } = renderAccess()
    await user.click(await screen.findByRole('combobox', { name: 'Access for Support' }))
    await user.click(await screen.findByRole('option', { name: 'No access' }))
    const dialog = await screen.findByRole('alertdialog', { name: "Remove Support's access?" })
    expect(await within(dialog).findByText(/3 people in Support lose access/)).toBeVisible()
    expect(within(dialog).getByText(/Support triage, Refund helper/)).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Remove access' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Access for Support' })).toHaveTextContent(
        'No access',
      )
    })
  })

  it('keeps the access when the removal is cancelled', async () => {
    const { user } = renderAccess()
    await user.click(await screen.findByRole('combobox', { name: 'Access for Support' }))
    await user.click(await screen.findByRole('option', { name: 'No access' }))
    const dialog = await screen.findByRole('alertdialog', { name: "Remove Support's access?" })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('combobox', { name: 'Access for Support' })).toHaveTextContent(
      'Can search',
    )
  })

  it('changes and removes a person exception', async () => {
    const { user } = renderAccess()
    await user.click(await screen.findByRole('combobox', { name: 'Access for Omar Haddad' }))
    await user.click(await screen.findByRole('option', { name: 'Can search' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Access for Omar Haddad' })).toHaveTextContent(
        'Can search',
      )
    })
    await user.click(screen.getByRole('button', { name: 'Remove Omar Haddad' }))
    await waitFor(() => {
      expect(screen.queryByText('Omar Haddad')).not.toBeInTheDocument()
    })
  })

  it('adds a person as an exception', async () => {
    const { user } = renderAccess()
    await screen.findByRole('combobox', { name: 'Access for Support' })
    await user.click(screen.getByRole('combobox', { name: 'Add a person' }))
    await user.click(await screen.findByRole('option', { name: /Ana Ruiz/ }))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('combobox', { name: 'Access for Ana Ruiz' })).toHaveTextContent(
      'Can search',
    )
  })

  it('names the agents a "Local models only" base blocks', async () => {
    renderAccess(HR_POLICIES_ID)
    expect(
      await screen.findByText(
        /These agents use cloud models and skip it: Support triage, Refund helper/,
      ),
    ).toBeVisible()
  })

  it('links to the change history in the audit log', async () => {
    renderAccess()
    const link = await screen.findByRole('link', { name: 'View change history' })
    expect(link).toHaveAttribute(
      'href',
      '/acme/guard/audit-log?action=knowledge_base.access_changed',
    )
  })

  it('shows an error with Try again when access does not load', async () => {
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.endsWith('/access')) {
        request.headers.set('x-mock-scenario', 'error')
      }
    })
    renderAccess()
    expect(await screen.findByText("Access didn't load")).toBeVisible()
  })
})
