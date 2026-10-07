// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import {
  HELP_CENTER_ID,
  knowledgeDomain,
  LEGACY_NOTES_ID,
  resetKnowledgeMock,
} from '../../../../mock/handlers/knowledge'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'
import KnowledgeBaseDetail from '../KnowledgeBaseDetail'

let mockParams: { orgSlug: string; kbId: string; tab?: string }

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: vi.fn() }),
}))

const server = setupTestServer(...knowledgeDomain.handlers, ...teamsDomain.handlers)

function renderTestSearch(kbId = HELP_CENTER_ID) {
  mockParams = { orgSlug: 'acme', kbId, tab: 'test-search' }
  return renderWithProviders(<KnowledgeBaseDetail />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
  })
}

beforeEach(() => {
  resetKnowledgeMock()
  resetTeamsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('TestSearchTab', () => {
  it('answers from the passages found and shows their relevance and whether they were used', async () => {
    const { user } = renderTestSearch()
    await user.type(
      await screen.findByLabelText('Question'),
      'Can I get a refund on an annual plan?',
    )
    await user.click(screen.getByRole('button', { name: 'Search' }))
    const results = await screen.findByRole('region', { name: 'Search results' })
    expect(within(results).getByText('Answer preview')).toBeVisible()
    expect(
      within(results).getAllByText(/Customers may cancel an annual plan/).length,
    ).toBeGreaterThan(1)
    expect(within(results).getByText(/passages? found/)).toBeVisible()
    expect(within(results).getAllByText(/% relevant/).length).toBeGreaterThan(0)
    expect(within(results).getAllByText('Used').length).toBeGreaterThan(0)
    expect(within(results).getAllByText('From Refund policy.pdf').length).toBeGreaterThan(0)
  })

  it('uses only as many passages as asked for', async () => {
    const { user } = renderTestSearch()
    await user.type(
      await screen.findByLabelText('Question'),
      'refund annual plan monthly plans paid',
    )
    const passages = screen.getByLabelText('Passages per answer')
    await user.clear(passages)
    await user.type(passages, '1')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    const results = await screen.findByRole('region', { name: 'Search results' })
    expect(within(results).getAllByText('Used')).toHaveLength(1)
    expect(within(results).getAllByText('Not used').length).toBeGreaterThan(0)
  })

  it('finds nothing when the team searched as cannot read this knowledge base', async () => {
    const { user } = renderTestSearch()
    await user.type(await screen.findByLabelText('Question'), 'refund annual plan')
    await user.click(screen.getByRole('combobox', { name: 'Search as' }))
    await user.click(await screen.findByRole('option', { name: 'Team: Sales' }))
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('No passages found')).toBeVisible()
  })

  it('says so when no passage matches', async () => {
    const { user } = renderTestSearch()
    await user.type(await screen.findByLabelText('Question'), 'qqqq zzzz')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('No passages found')).toBeVisible()
    expect(screen.queryByText('Answer preview')).not.toBeInTheDocument()
  })

  it('names the sources still processing that were not searched', async () => {
    const { user } = renderTestSearch()
    await user.type(await screen.findByLabelText('Question'), 'refund')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(
      await screen.findByText("1 source is still processing and wasn't searched."),
    ).toBeVisible()
  })

  it('needs a question before it can search', async () => {
    renderTestSearch()
    expect(await screen.findByRole('button', { name: 'Search' })).toBeDisabled()
  })

  it('is disabled with the reason while the base has no embedding model', async () => {
    renderTestSearch(LEGACY_NOTES_ID)
    expect(await screen.findByText('Choose an embedding model first')).toBeVisible()
    expect(screen.getByLabelText('Question')).toBeDisabled()
  })

  it('shows the error when the search fails', async () => {
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') request.headers.set('x-mock-scenario', 'error')
    })
    const { user } = renderTestSearch()
    await user.type(await screen.findByLabelText('Question'), 'refund')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeVisible()
    })
  })
})
