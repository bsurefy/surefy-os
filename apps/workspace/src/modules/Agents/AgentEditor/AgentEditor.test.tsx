// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  agentEditorHandlers,
  readSavedAgent,
  renderAgentEditor,
  useScenarioFor,
} from '@/test/agentEditor'
import { setupTestServer } from '@surefy/web-core/testing'

import {
  ARCHIVED_AGENT_ID,
  DRAFT_AGENT_ID,
  READ_ONLY_AGENT_ID,
  resetAgentsMock,
  SUPPORT_AGENT_ID,
} from '../../../../mock/handlers/agents'
import { resetKnowledgeMock } from '../../../../mock/handlers/knowledge'
import { resetModelsMock } from '../../../../mock/handlers/models'
import { resetTeamsMock } from '../../../../mock/handlers/teams'
import { resetVaultMock } from '../../../../mock/handlers/vault'
import { ORG_ID } from '../../../test/shell'

import type * as AgentEditorConstants from './AgentEditor.constants'

let mockParams: { orgSlug: string; agentId: string; tab?: string }

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: vi.fn() }),
}))

// a short wait, so the tests do not sit through the real autosave delay
vi.mock('./AgentEditor.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentEditorConstants>()),
  AUTOSAVE_DELAY_MS: 20,
}))

const server = setupTestServer(...agentEditorHandlers)

function openAgent(agentId: string, tab = 'instructions') {
  mockParams = { orgSlug: 'acme', agentId, tab }
  return renderAgentEditor()
}

async function readDraft(agentId: string) {
  const saved = await readSavedAgent(agentId)
  return { name: saved.name, draft: saved.draft }
}

beforeEach(() => {
  localStorage.clear()
  resetAgentsMock()
  resetKnowledgeMock()
  resetModelsMock()
  resetTeamsMock()
  resetVaultMock()
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('AgentEditor header', () => {
  it('shows the live version and counts the unpublished changes', async () => {
    openAgent(SUPPORT_AGENT_ID)
    expect(await screen.findByRole('heading', { name: 'Support triage', level: 1 })).toBeVisible()
    expect(screen.getByText('Version 3 is live')).toBeVisible()
    // the draft has new instructions and a higher creativity than the live version
    expect(await screen.findByText('2 unpublished changes')).toBeVisible()
    expect(screen.getByText(/Saved \d/)).toBeVisible()
    // the Test button next to the Test tab
    expect(screen.getAllByRole('link', { name: 'Test' })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Publish v4' })).toHaveAttribute(
      'href',
      `/acme/agents/${SUPPORT_AGENT_ID}/publish`,
    )
  })

  it('says an agent was never published and offers its first version', async () => {
    openAgent(DRAFT_AGENT_ID)
    expect(await screen.findByText('Not published yet')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Publish v1' })).toBeVisible()
    expect(screen.queryByText(/unpublished change/)).not.toBeInTheDocument()
  })

  it('links every tab of the editor', async () => {
    openAgent(SUPPORT_AGENT_ID, 'knowledge')
    const tabs = await screen.findByRole('navigation', { name: 'Agent sections' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Instructions',
      'Model',
      'Tools',
      'Knowledge',
      'Guard',
      'Test',
      'Publish',
      'Versions',
      'Runs',
    ])
    expect(within(tabs).getByRole('link', { name: 'Knowledge' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('explains an agent that is not there', async () => {
    openAgent('00000000-0000-4000-8000-000000000000')
    expect(await screen.findByText("This agent isn't available")).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to Agents' })).toHaveAttribute(
      'href',
      '/acme/agents',
    )
  })
})

describe('AgentEditor loading', () => {
  it('shows a skeleton first, then offers a retry when the agent cannot load', async () => {
    server.events.on('request:start', ({ request }) => {
      request.headers.set('x-mock-scenario', 'error')
    })
    openAgent(SUPPORT_AGENT_ID)
    expect(screen.getByRole('status', { name: 'Loading the agent' })).toBeVisible()
    expect(await screen.findByText("Couldn't load this agent")).toBeVisible()
    expect(screen.getByRole('button', { name: /Try again|Retry/ })).toBeVisible()
  })
})

describe('AgentEditor autosave', () => {
  it('saves the instructions after typing and shows when it was saved', async () => {
    const { user } = openAgent(SUPPORT_AGENT_ID)
    const box = await screen.findByRole('textbox', { name: 'Instructions' })
    await user.type(box, ' Always greet by name.')
    await waitFor(async () => {
      expect((await readDraft(SUPPORT_AGENT_ID)).draft.definition.instructions).toMatch(
        /Always greet by name\.$/,
      )
    })
    expect((await readDraft(SUPPORT_AGENT_ID)).draft.revision).toBeGreaterThan(7)
    expect(await screen.findByText(/Saved \d/)).toBeVisible()
  })

  it('counts a new change as it is typed', async () => {
    const { user } = openAgent(SUPPORT_AGENT_ID)
    expect(await screen.findByText('2 unpublished changes')).toBeVisible()
    await user.type(await screen.findByRole('textbox', { name: /Tone of voice/ }), ' and warm')
    expect(await screen.findByText('3 unpublished changes')).toBeVisible()
  })

  it('saves a new name apart from the draft', async () => {
    const { user } = openAgent(SUPPORT_AGENT_ID)
    const name = await screen.findByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Order helper')
    await waitFor(async () => {
      expect((await readDraft(SUPPORT_AGENT_ID)).name).toBe('Order helper')
    })
    expect(await screen.findByRole('heading', { name: 'Order helper', level: 1 })).toBeVisible()
  })

  it('does not save an empty name and says why', async () => {
    const { user } = openAgent(SUPPORT_AGENT_ID)
    await user.clear(await screen.findByRole('textbox', { name: 'Name' }))
    expect(await screen.findByText('Give the agent a name.')).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect((await readDraft(SUPPORT_AGENT_ID)).name).toBe('Support triage')
    // the header keeps the last good name
    expect(screen.getByRole('heading', { name: 'Support triage', level: 1 })).toBeVisible()
  })

  it('keeps the draft on the device and offers Retry when a save fails', async () => {
    const { user } = openAgent(SUPPORT_AGENT_ID)
    const box = await screen.findByRole('textbox', { name: 'Instructions' })
    useScenarioFor(server, 'PUT', 'error')
    await user.type(box, '!')
    expect(await screen.findByText(/Couldn't save/)).toBeVisible()
    expect(Object.keys(localStorage)).toContain(`surefy:agent-draft:${ORG_ID}:${SUPPORT_AGENT_ID}`)

    server.events.removeAllListeners()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/Saved \d/)).toBeVisible()
    expect(Object.keys(localStorage)).not.toContain(
      `surefy:agent-draft:${ORG_ID}:${SUPPORT_AGENT_ID}`,
    )
    expect((await readDraft(SUPPORT_AGENT_ID)).draft.definition.instructions).toMatch(/!$/)
  })

  it('offers Keep mine or Review changes when someone published first', async () => {
    const { user } = openAgent(SUPPORT_AGENT_ID)
    const box = await screen.findByRole('textbox', { name: 'Instructions' })
    useScenarioFor(server, 'PUT', 'conflict')
    await user.type(box, '?')
    expect(await screen.findByText('Omar Haddad published v4 while you were editing')).toBeVisible()

    server.events.removeAllListeners()
    await user.click(screen.getByRole('button', { name: 'Keep mine' }))
    await waitFor(async () => {
      expect((await readDraft(SUPPORT_AGENT_ID)).draft.definition.instructions).toMatch(/\?$/)
    })
    expect(screen.queryByText(/while you were editing/)).not.toBeInTheDocument()
  })

  it('takes their draft on Review changes', async () => {
    const { user } = openAgent(SUPPORT_AGENT_ID)
    const box = await screen.findByRole('textbox', { name: 'Instructions' })
    const theirs = (box as HTMLTextAreaElement).value
    useScenarioFor(server, 'PUT', 'conflict')
    await user.type(box, '?')
    await screen.findByRole('button', { name: 'Review changes' })

    server.events.removeAllListeners()
    await user.click(screen.getByRole('button', { name: 'Review changes' }))
    expect(screen.queryByText(/while you were editing/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toHaveValue(theirs)
  })
})

describe('AgentEditor read-only', () => {
  it('shows an archived agent without anything to change', async () => {
    openAgent(ARCHIVED_AGENT_ID)
    expect(await screen.findByText('This agent is archived')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('readonly')
    expect(screen.queryByRole('link', { name: /Publish v/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add starter' })).not.toBeInTheDocument()
  })

  it('shows an agent shared for reading without Test and Publish', async () => {
    openAgent(READ_ONLY_AGENT_ID)
    expect(await screen.findByText('You can view this agent but not change it')).toBeVisible()
    // only the tab is left, not the button
    expect(screen.getAllByRole('link', { name: 'Test' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /Publish v/ })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toHaveAttribute('readonly')
  })
})
