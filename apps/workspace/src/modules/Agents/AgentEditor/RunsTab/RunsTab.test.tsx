// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { agentEditorHandlers, renderAgentEditor, useScenarioFor } from '@/test/agentEditor'
import { ORG_ID } from '@/test/shell'
import { setupTestServer } from '@surefy/web-core/testing'

import { setRunStreamDelay } from '../../../../../mock/handlers/agentRuns'
import {
  DRAFT_AGENT_ID,
  resetAgentsMock,
  SUPPORT_AGENT_ID,
} from '../../../../../mock/handlers/agents'
import { resetGuardMock } from '../../../../../mock/handlers/guard'
import { resetKnowledgeMock } from '../../../../../mock/handlers/knowledge'
import { resetMembersMock } from '../../../../../mock/handlers/members'
import { resetModelsMock } from '../../../../../mock/handlers/models'
import { resetTeamsMock } from '../../../../../mock/handlers/teams'
import { resetVaultMock } from '../../../../../mock/handlers/vault'

import type * as AgentEditorConstants from '../AgentEditor.constants'

let mockAgentId = SUPPORT_AGENT_ID

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'runs' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../AgentEditor.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentEditorConstants>()),
  AUTOSAVE_DELAY_MS: 20,
}))

const server = setupTestServer(...agentEditorHandlers)

beforeEach(() => {
  mockAgentId = SUPPORT_AGENT_ID
  localStorage.clear()
  resetAgentsMock()
  resetGuardMock()
  resetKnowledgeMock()
  resetMembersMock()
  resetModelsMock()
  resetTeamsMock()
  resetVaultMock()
  setRunStreamDelay(0)
})

afterEach(() => {
  server.events.removeAllListeners()
})

const table = () => screen.findByRole('table', { name: 'Runs of this agent' })
/** The rows of the table, without its header. */
const rowsOf = (element: HTMLElement) => within(element).getAllByRole('row').slice(1)
/** The rows once the list has loaded and has this many. */
async function expectRows(count: number) {
  await waitFor(() => {
    expect(rowsOf(screen.getByRole('table', { name: 'Runs of this agent' }))).toHaveLength(count)
  })
  return rowsOf(await table())
}

describe('RunsTab list', () => {
  it("lists the agent's runs, newest first, each with how it went", async () => {
    renderAgentEditor()
    const newest = within((await expectRows(12)).slice(0, 1)[0] ?? document.body)
    expect(newest.getByText('Waiting for approval')).toBeVisible()
    expect(newest.getByText('Needed a person')).toBeVisible()
    expect(newest.getByText('v3')).toBeVisible()
    expect(newest.getByText('SurefyOS chat')).toBeVisible()
  })

  it('opens the run in Insights', async () => {
    renderAgentEditor()
    const newest = within((await expectRows(12)).slice(0, 1)[0] ?? document.body)
    expect(newest.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/acme\/insights\/runs\/[\w-]+$/),
    )
  })

  it('leaves test runs out unless asked for', async () => {
    renderAgentEditor()
    await expectRows(12)
    await fetch(
      `http://localhost:3000/api/v1/orgs/${ORG_ID}/agents/${SUPPORT_AGENT_ID}/test-runs`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', text: 'Where is my order?' }] }),
      },
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('switch', { name: 'Test runs' }))
    await expectRows(1)
    expect(screen.getByText('Test run')).toBeVisible()
    expect(screen.getByText('Draft')).toBeVisible()
  })

  it('says so when the agent has no runs yet', async () => {
    mockAgentId = DRAFT_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText('No runs yet')).toBeVisible()
  })
})

describe('RunsTab filters', () => {
  it('shows only the runs with the chosen status', async () => {
    renderAgentEditor()
    await expectRows(12)
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Failed' }))
    await expectRows(1)
    expect(within(await table()).getByText('Failed')).toBeVisible()
  })

  it('shows the runs that needed a person', async () => {
    renderAgentEditor()
    await expectRows(12)
    const user = userEvent.setup()
    await user.click(screen.getByRole('switch', { name: 'Needed a person' }))
    await expectRows(2)
  })

  it('searches by person and clears the filters when nothing matches', async () => {
    renderAgentEditor()
    await expectRows(12)
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox', { name: 'Search runs' }), 'nobody')
    expect(await screen.findByText('No runs match')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await expectRows(12)
  })
})

describe('RunsTab failures', () => {
  it('says so when the runs cannot be read', async () => {
    useScenarioFor(server, 'GET', 'error', '/runs')
    renderAgentEditor()
    expect(await screen.findByText("Couldn't load the runs")).toBeVisible()
  })
})
