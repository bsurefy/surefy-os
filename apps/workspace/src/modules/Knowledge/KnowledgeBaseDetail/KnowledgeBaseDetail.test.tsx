// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import KnowledgeBaseDetail from './KnowledgeBaseDetail'
import {
  HELP_CENTER_ID,
  HR_POLICIES_ID,
  knowledgeDomain,
  LEGACY_NOTES_ID,
  resetKnowledgeMock,
} from '../../../../mock/handlers/knowledge'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

const mockPush = vi.fn()
let mockParams: { orgSlug: string; kbId: string; tab?: string }

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}))

const server = setupTestServer(...knowledgeDomain.handlers, ...teamsDomain.handlers)

function renderDetail(kbId = HELP_CENTER_ID, tab?: string) {
  mockParams = { orgSlug: 'acme', kbId, tab }
  return renderWithProviders(<KnowledgeBaseDetail />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

beforeEach(() => {
  mockPush.mockClear()
  resetKnowledgeMock()
  resetTeamsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('KnowledgeBaseDetail', () => {
  it('shows the name, the facts, the data location and the tabs', async () => {
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Help center', level: 1 })).toBeVisible()
    expect(
      await screen.findByText(/5 sources · 21 searchable passages · used by 2 agents/),
    ).toBeVisible()
    expect(screen.getByText(/Sent to Text embedding 3 small/)).toBeVisible()
    const tabs = screen.getByRole('navigation', { name: 'Knowledge base sections' })
    expect(within(tabs).getByRole('link', { name: 'Sources' })).toHaveAttribute(
      'href',
      `/acme/knowledge/${HELP_CENTER_ID}/sources`,
    )
    expect(within(tabs).getByRole('link', { name: 'Test search' })).toBeVisible()
    expect(within(tabs).getByRole('link', { name: 'Access' })).toBeVisible()
    expect(within(tabs).getByRole('link', { name: 'Settings' })).toBeVisible()
  })

  it('says a local-only base stays on the server', async () => {
    renderDetail(HR_POLICIES_ID)
    expect(await screen.findByRole('heading', { name: 'HR Policies' })).toBeVisible()
    expect(screen.getByText('Local models only')).toBeVisible()
    expect(screen.getByText('Stays on your server')).toBeVisible()
  })

  it('shows the not-found state with a way back', async () => {
    renderDetail('00000000-0000-4000-8000-00000000dead')
    expect(await screen.findByText("This knowledge base isn't available")).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to Knowledge' })).toHaveAttribute(
      'href',
      '/acme/knowledge',
    )
  })

  it('shows an error with Try again when the base does not load', async () => {
    useScenario('error')
    renderDetail()
    expect(await screen.findByText("This knowledge base didn't load")).toBeVisible()
  })

  it('shows only the sources, read-only, to people who can only search', async () => {
    useScenario('search-only')
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Help center', level: 1 })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Knowledge base sections' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Drop files here or browse')).not.toBeInTheDocument()
  })

  it('renames the knowledge base and refuses a taken name', async () => {
    const { user } = renderDetail()
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const dialog = await screen.findByRole('dialog', { name: 'Rename knowledge base' })
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'hr policies')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText(/already exists/)).toBeVisible()
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Support center')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('heading', { name: 'Support center', level: 1 })).toBeVisible()
  })

  it('confirms a re-index with the passages and the time, and shows it running', async () => {
    const { user } = renderDetail()
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Re-index all' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Re-index all sources?' })
    expect(
      await within(dialog).findByText(
        /Search quality may drop until 21 passages are re-indexed, about 1 minute/,
      ),
    ).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Re-index all' }))
    expect(await screen.findByText('Re-indexing')).toBeVisible()
  })

  it('deletes with a typed name, names the agents, and goes back to Knowledge', async () => {
    const { user } = renderDetail()
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Help center?' })
    expect(await within(dialog).findByText(/Support triage, Refund helper/)).toBeVisible()
    expect(within(dialog).getByText(/restore it for 30 days/)).toBeVisible()
    await user.type(within(dialog).getByLabelText(/Type Help center to confirm/), 'Help center')
    await user.type(within(dialog).getByLabelText('Reason'), 'Merged into another base')
    await user.click(within(dialog).getByRole('button', { name: 'Delete knowledge base' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/acme/knowledge')
    })
  })

  it('disables Re-index all while a base has no embedding model', async () => {
    const { user } = renderDetail(LEGACY_NOTES_ID)
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Re-index all' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
