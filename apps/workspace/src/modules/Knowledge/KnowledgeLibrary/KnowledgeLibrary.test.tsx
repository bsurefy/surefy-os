// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import KnowledgeLibrary from './KnowledgeLibrary'
import {
  HELP_CENTER_ID,
  knowledgeDomain,
  resetKnowledgeMock,
} from '../../../../mock/handlers/knowledge'
import { resetTeamsMock, teamsDomain } from '../../../../mock/handlers/teams'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
  useRouter: () => ({ push: mockPush }),
}))

const server = setupTestServer(...knowledgeDomain.handlers, ...teamsDomain.handlers)

function renderLibrary(searchParams?: string) {
  return renderWithProviders(<KnowledgeLibrary />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs('admin')),
    searchParams,
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`No row for ${name}`)
  return row
}

beforeEach(() => {
  mockPush.mockClear()
  resetKnowledgeMock()
  resetTeamsMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('KnowledgeLibrary', () => {
  it('shows the KPIs and one row per knowledge base with its sources, status and access', async () => {
    renderLibrary()
    const table = await screen.findByRole('table', { name: 'Knowledge bases' })
    expect(await within(table).findByText('Help center')).toBeVisible()

    const help = rowOf('Help center')
    expect(help).toHaveTextContent('4 files · 1 link')
    expect(help).toHaveTextContent('Processing 1 source')
    expect(help).toHaveTextContent('Support')
    expect(help).toHaveTextContent('2')

    expect(rowOf('HR Policies')).toHaveTextContent('Local models only')
    expect(rowOf('HR Policies')).toHaveTextContent('Ready')
    expect(rowOf('Legacy notes')).toHaveTextContent('No sources')
    expect(rowOf('Sales playbook')).toHaveTextContent('No sources')
    expect(within(table).queryByText('Old wiki')).not.toBeInTheDocument()

    const kpis = screen.getByRole('region', { name: 'Knowledge summary' })
    await waitFor(() => {
      expect(within(kpis).getByText('Knowledge bases').parentElement).toHaveTextContent('4')
    })
    expect(within(kpis).getByText('Sources').parentElement).toHaveTextContent('6')
    expect(within(kpis).getByText('Processing').parentElement).toHaveTextContent('1')
    expect(within(kpis).getByText('Needs attention').parentElement).toHaveTextContent('3')
  })

  it('opens a knowledge base from its row', async () => {
    renderLibrary()
    const link = await screen.findByRole('link', { name: /Help center/ })
    expect(link).toHaveAttribute('href', `/acme/knowledge/${HELP_CENTER_ID}`)
  })

  it('searches by name and filters by needs attention and local models only', async () => {
    const { user } = renderLibrary()
    await screen.findByText('Help center')
    await user.type(screen.getByRole('searchbox', { name: 'Search knowledge bases' }), 'sales')
    expect(await screen.findByText('Sales playbook')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('Help center')).not.toBeInTheDocument()
    })
  })

  it('applies the filter from the URL', async () => {
    renderLibrary('?filter=attention')
    expect(await screen.findByText('Help center')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('HR Policies')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Sales playbook')).not.toBeInTheDocument()
  })

  it('keeps only Local models only bases with that filter', async () => {
    renderLibrary('?filter=local')
    expect(await screen.findByText('HR Policies')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('Help center')).not.toBeInTheDocument()
    })
  })

  it('says so when nothing matches, and clears the search', async () => {
    const { user } = renderLibrary()
    await screen.findByText('Help center')
    await user.type(screen.getByRole('searchbox', { name: 'Search knowledge bases' }), 'zzz')
    expect(await screen.findByText('No knowledge bases found')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Help center')).toBeVisible()
  })

  it('creates a knowledge base with the teams that may search it and opens it', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('button', { name: 'New knowledge base' }))
    const dialog = await screen.findByRole('dialog', { name: 'New knowledge base' })
    await user.type(within(dialog).getByLabelText('Name'), 'Engineering wiki')
    await user.click(within(dialog).getByRole('button', { name: 'Create knowledge base' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/acme\/knowledge\/[\w-]+$/))
    })
  })

  it('refuses a name that is taken, on the name field', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('button', { name: 'New knowledge base' }))
    const dialog = await screen.findByRole('dialog', { name: 'New knowledge base' })
    await user.type(within(dialog).getByLabelText('Name'), 'help center')
    await user.click(within(dialog).getByRole('button', { name: 'Create knowledge base' }))
    expect(await within(dialog).findByText(/already exists/)).toBeVisible()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('explains that "Local models only" needs a local embedding model', async () => {
    useScenario('no-local-embedding')
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('button', { name: 'New knowledge base' }))
    const dialog = await screen.findByRole('dialog', { name: 'New knowledge base' })
    await user.type(within(dialog).getByLabelText('Name'), 'Secrets')
    await user.click(within(dialog).getByRole('switch', { name: /Local models only/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Create knowledge base' }))
    expect(await within(dialog).findByText(/needs a local embedding model/)).toBeVisible()
  })

  it('opens New knowledge base from the command palette link', async () => {
    renderLibrary('?create=1')
    expect(await screen.findByRole('dialog', { name: 'New knowledge base' })).toBeVisible()
  })

  it('shows the first-time state with the create action', async () => {
    useScenario('empty')
    renderLibrary()
    expect(await screen.findByText('Create your first knowledge base')).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'New knowledge base' }).length).toBeGreaterThan(0)
  })

  it('shows an error with Try again when the list does not load', async () => {
    useScenario('error')
    renderLibrary()
    expect(await screen.findByText("Knowledge bases didn't load")).toBeVisible()
    expect(screen.getByRole('button', { name: /Try again|Retry/ })).toBeVisible()
  })
})

describe('Recently deleted', () => {
  it('lists deleted bases and sources with who deleted them and the days left', async () => {
    const { user } = renderLibrary()
    await user.click(await screen.findByRole('radio', { name: 'Recently deleted' }))
    const section = await screen.findByRole('region', { name: 'Recently deleted' })
    const wiki = (await within(section).findByText('Old wiki')).closest('li')
    expect(wiki).toHaveTextContent('Knowledge base')
    expect(wiki).toHaveTextContent(/Deleted by Maya Okafor on/)
    expect(wiki).toHaveTextContent('Restorable for 27 more days')
    const pricing = within(section).getByText('Old pricing.pdf').closest('li')
    expect(pricing).toHaveTextContent('Source in Help center')
    expect(pricing).toHaveTextContent('Restorable for 25 more days')
  })

  it('restores a knowledge base, and it is back in the list', async () => {
    const { user } = renderLibrary('?view=deleted')
    await user.click(await screen.findByRole('button', { name: 'Restore Old wiki' }))
    await waitFor(() => {
      expect(screen.queryByText('Old wiki')).not.toBeInTheDocument()
    })
    await user.click(screen.getByRole('radio', { name: 'Knowledge bases' }))
    expect(await screen.findByText('Old wiki')).toBeVisible()
  })

  it('restores a source', async () => {
    const { user } = renderLibrary('?view=deleted')
    await user.click(await screen.findByRole('button', { name: 'Restore Old pricing.pdf' }))
    await waitFor(() => {
      expect(screen.queryByText('Old pricing.pdf')).not.toBeInTheDocument()
    })
  })

  it('asks for another name when the old one is taken', async () => {
    useScenario('restore-name-taken')
    const { user } = renderLibrary('?view=deleted')
    await user.click(await screen.findByRole('button', { name: 'Restore Old wiki' }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose another name' })
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Old wiki 2')
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }))
    expect(await within(dialog).findByText(/already exists/)).toBeVisible()
  })

  it('shows the empty state when nothing was deleted', async () => {
    useScenario('empty')
    renderLibrary('?view=deleted')
    expect(await screen.findByText('Nothing deleted in the last 30 days')).toBeVisible()
  })

  it('hides the switch from people who manage no knowledge base', async () => {
    useScenario('search-only')
    renderLibrary()
    expect(await screen.findByText('Help center')).toBeVisible()
    expect(screen.queryByRole('radio', { name: 'Recently deleted' })).not.toBeInTheDocument()
  })
})
