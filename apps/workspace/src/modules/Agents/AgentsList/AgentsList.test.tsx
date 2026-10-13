// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { delay, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appMessages } from '@/test/messages'
import { accessAs, ORG_ID, seededShellClient } from '@/test/shell'
import type { OrgRole } from '@surefy/contracts'
import { renderWithProviders, setupTestServer } from '@surefy/web-core/testing'

import AgentsList from './AgentsList'
import { agentsDomain, resetAgentsMock, SUPPORT_AGENT_ID } from '../../../../mock/handlers/agents'
import { guardDomain, resetGuardMock } from '../../../../mock/handlers/guard'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
  useRouter: () => ({ push: mockPush }),
}))

const server = setupTestServer(...agentsDomain.handlers, ...guardDomain.handlers)

function renderList(searchParams?: string, role: OrgRole = 'builder') {
  return renderWithProviders(<AgentsList />, {
    orgId: ORG_ID,
    messages: appMessages,
    queryClient: seededShellClient(accessAs(role)),
    searchParams,
  })
}

/** Forces a scenario on every mocked request of this test. */
function useScenario(scenario: string) {
  server.events.on('request:start', ({ request }) => {
    request.headers.set('x-mock-scenario', scenario)
  })
}

/** The cards are list items named after their agent. */
const cardOf = async (name: string) => {
  const link = await screen.findByRole('link', { name })
  const card = link.closest('li')
  if (!card) throw new Error(`No card for ${name}`)
  return card
}

const menuOf = (name: string) => screen.findByRole('button', { name: `Actions for ${name}` })

/** The Undo button of the toast with this text; toasts of earlier tests may still be on screen. */
function undoButton(message: string) {
  const toast = screen.getByText(message).closest('li')
  if (!toast) throw new Error(`No toast says "${message}"`)
  return within(toast).getByRole('button', { name: 'Undo' })
}

beforeEach(() => {
  mockPush.mockClear()
  resetAgentsMock()
  resetGuardMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('AgentsList', () => {
  it('shows a card per agent with its status, model, runs, trust, approvals and audience', async () => {
    renderList()
    const support = await cardOf('Support triage')
    expect(support).toHaveTextContent('Active')
    expect(support).toHaveTextContent('Unpublished changes')
    expect(support).toHaveTextContent('GPT-4.1')
    expect(support).toHaveTextContent('Sent to openai')
    expect(support).toHaveTextContent('142 runs')
    expect(support).toHaveTextContent('3 approvals')
    expect(support).toHaveTextContent('93%')
    expect(support).toHaveTextContent('Support')
    expect(support).toHaveTextContent('Succeeded')

    expect(await cardOf('New agent')).toHaveTextContent('Draft')
    expect(await cardOf('HR helper')).toHaveTextContent('Not enough runs yet')
    expect(screen.queryByText('Old invoice checker')).not.toBeInTheDocument()
  })

  it('opens an agent in its editor from the card', async () => {
    renderList()
    expect(await screen.findByRole('link', { name: 'Support triage' })).toHaveAttribute(
      'href',
      `/acme/agents/${SUPPORT_AGENT_ID}`,
    )
  })

  it('marks an agent that needs attention and says why', async () => {
    renderList()
    const sales = await cardOf('Sales assistant')
    expect(sales).toHaveTextContent('Needs attention')
    expect(sales).toHaveTextContent('The model is no longer allowed')
    expect(sales).toHaveTextContent('The last 5 runs failed')
    expect(await cardOf('Support triage')).not.toHaveTextContent('Needs attention')
  })

  it('shows the same facts as a table', async () => {
    renderList('?view=table')
    const table = await screen.findByRole('table', { name: 'Agents' })
    const row = (await within(table).findByText('Support triage')).closest('tr')
    expect(row).toHaveTextContent('142 runs')
    expect(row).toHaveTextContent('93%')
    expect(within(table).getByText('Sales assistant').closest('tr')).toHaveTextContent(
      'Needs attention',
    )
  })

  it('keeps only the agents that need attention with that filter', async () => {
    renderList('?filter=attention')
    expect(await screen.findByText('Sales assistant')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('Support triage')).not.toBeInTheDocument()
    })
  })

  it('lists archived agents under Archived, with Restore', async () => {
    const { user } = renderList('?filter=archived')
    expect(await screen.findByText('Old invoice checker')).toBeVisible()
    await user.click(await menuOf('Old invoice checker'))
    expect(await screen.findByRole('menuitem', { name: 'Restore' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('searches by name and says so when nothing matches', async () => {
    const { user } = renderList()
    await screen.findByText('Support triage')
    await user.type(screen.getByRole('searchbox', { name: 'Search agents' }), 'hr')
    expect(await screen.findByText('HR helper')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('Support triage')).not.toBeInTheDocument()
    })
    await user.clear(screen.getByRole('searchbox', { name: 'Search agents' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search agents' }), 'zzz')
    expect(await screen.findByText('No agents found')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Support triage')).toBeVisible()
  })

  it('shows the first-time state with the templates when there are no agents', async () => {
    useScenario('empty')
    renderList()
    expect(await screen.findByText('Create your first agent')).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'Customer Support' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Start from scratch' })).toBeVisible()
  })

  it('creates an agent from scratch and opens its editor', async () => {
    const { user } = renderList()
    await user.click(await screen.findByRole('button', { name: 'Create agent' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/acme\/agents\/[\w-]+$/))
    })
  })

  it('says why an agent could not be created when the plan limit is reached', async () => {
    useScenario('limit-reached')
    const { user } = renderList()
    await user.click(await screen.findByRole('button', { name: 'Create agent' }))
    expect(await screen.findByText("Couldn't create the agent")).toBeVisible()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('hides Create agent and Duplicate from people who cannot create agents', async () => {
    const { user } = renderList(undefined, 'user')
    await screen.findByText('Support triage')
    expect(screen.queryByRole('button', { name: 'Create agent' })).not.toBeInTheDocument()
    await user.click(await menuOf('Support triage'))
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).not.toBeInTheDocument()
  })

  it('duplicates at once (T0) and opens the copy', async () => {
    const { user } = renderList()
    await user.click(await menuOf('HR helper'))
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/acme\/agents\/[\w-]+$/))
    })
  })

  it('offers only Duplicate on an agent shared for reading', async () => {
    const { user } = renderList()
    await user.click(await menuOf('HR helper'))
    expect(await screen.findAllByRole('menuitem')).toHaveLength(1)
  })

  it('asks before pausing (T2), names who is affected, then pauses', async () => {
    const { user } = renderList()
    await user.click(await menuOf('Support triage'))
    await user.click(await screen.findByRole('menuitem', { name: 'Pause' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Pause Support triage?' })
    expect(await within(dialog).findByText('Shared with 1 team.')).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: 'Pause agent' }))
    expect(await screen.findByText('Support triage is paused')).toBeVisible()
    expect(await within(await cardOf('Support triage')).findByText('Paused')).toBeVisible()
  })

  it('waits for the consequences when pausing is confirmed before they arrived', async () => {
    // a slow answer, then the mock's own
    server.use(
      http.get('*/agents/:agentId/impact', async () => {
        await delay(300)
      }),
    )
    const { user } = renderList()
    await user.click(await menuOf('Support triage'))
    await user.click(await screen.findByRole('menuitem', { name: 'Pause' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Pause Support triage?' })
    // no wait for "Shared with 1 team.": the person is quicker than the answer
    await user.click(within(dialog).getByRole('button', { name: 'Pause agent' }))
    expect(await within(await cardOf('Support triage')).findByText('Paused')).toBeVisible()
  })

  it('archives a draft at once (T1) and brings it back with Undo', async () => {
    const { user } = renderList()
    await user.click(await menuOf('New agent'))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await screen.findByText('New agent was archived')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'New agent' })).not.toBeInTheDocument()
    })
    await user.click(undoButton('New agent was archived'))
    expect(await screen.findByRole('link', { name: 'New agent' })).toBeVisible()
  })

  it('asks before archiving a published agent (T2)', async () => {
    const { user } = renderList()
    await user.click(await menuOf('Support triage'))
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Support triage?' })
    await user.click(within(dialog).getByRole('button', { name: 'Archive agent' }))
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Support triage' })).not.toBeInTheDocument()
    })
  })

  it('hides a never-published agent while its delete waits (T1) and keeps it on Undo', async () => {
    const deletes: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'DELETE') deletes.push(new URL(request.url).pathname)
    })
    const { user } = renderList()
    await user.click(await menuOf('New agent'))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }))
    expect(await screen.findByText('New agent was deleted')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'New agent' })).not.toBeInTheDocument()
    expect(deletes).toHaveLength(0)
    await user.click(undoButton('New agent was deleted'))
    expect(await screen.findByRole('link', { name: 'New agent' })).toBeVisible()
    expect(deletes).toHaveLength(0)
  })

  it('asks for the name and a reason before deleting a published agent (T3)', async () => {
    const { user } = renderList()
    await user.click(await menuOf('Support triage'))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Support triage?' })
    expect(
      await within(dialog).findByText(
        "Its 4,812 runs stay in the audit log, but the agent can't be restored.",
      ),
    ).toBeVisible()

    await user.click(within(dialog).getByRole('button', { name: 'Delete agent' }))
    expect(await within(dialog).findByText('Enter a reason')).toBeVisible()

    await user.type(within(dialog).getByLabelText('Reason'), 'Replaced by a new agent')
    await user.type(
      within(dialog).getByLabelText('Type Support triage to confirm'),
      'Support triage',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Delete agent' }))
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Support triage' })).not.toBeInTheDocument()
    })
  })

  it('says so and offers a retry when the agents cannot be loaded', async () => {
    useScenario('error')
    renderList()
    expect(await screen.findByText("Couldn't load the agents")).toBeVisible()
  })
})
