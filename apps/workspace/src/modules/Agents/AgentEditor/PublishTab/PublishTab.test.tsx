// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  agentEditorHandlers,
  leaveAgentEditor,
  readSavedAgent,
  renderAgentEditor,
  useScenarioFor,
} from '@/test/agentEditor'
import { ORG_ID } from '@/test/shell'
import { setupTestServer } from '@surefy/web-core/testing'

import {
  DRAFT_AGENT_ID,
  READ_ONLY_AGENT_ID,
  resetAgentsMock,
  RETIRED_MODEL_AGENT_ID,
  SUPPORT_AGENT_ID,
} from '../../../../../mock/handlers/agents'
import { resetKnowledgeMock } from '../../../../../mock/handlers/knowledge'
import { resetModelsMock } from '../../../../../mock/handlers/models'
import { resetTeamsMock } from '../../../../../mock/handlers/teams'
import { resetVaultMock } from '../../../../../mock/handlers/vault'

import type * as AgentEditorConstants from '../AgentEditor.constants'

let mockAgentId = SUPPORT_AGENT_ID

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'publish' }),
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
  resetKnowledgeMock()
  resetModelsMock()
  resetTeamsMock()
  resetVaultMock()
})

afterEach(async () => {
  await leaveAgentEditor(server)
  server.events.removeAllListeners()
})

const publishButton = () => screen.findByRole('button', { name: /^Publish v\d/ })
const apiUrl = (agentId: string, path: string) =>
  `http://localhost:3000/api/v1/orgs/${ORG_ID}/agents/${agentId}/${path}`

async function readVersions(agentId: string) {
  const response = await fetch(apiUrl(agentId, 'versions'))
  return ((await response.json()) as { data: { version: number; notes: string | null }[] }).data
}

describe('PublishTab readiness', () => {
  it('shows what passes, and warns about what is only worth a look', async () => {
    renderAgentEditor()
    expect(await screen.findByText('Ready to publish.')).toBeVisible()
    expect(screen.getByText('Instructions are written')).toBeVisible()
    // a warning does not stop a publish
    expect(screen.getByText('No test run since the last change.')).toBeVisible()
    expect(await publishButton()).toBeEnabled()
  })

  it('blocks the publish and links to the tab that fixes what fails', async () => {
    mockAgentId = RETIRED_MODEL_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText('1 thing to fix before publishing.')).toBeVisible()
    expect(screen.getByText(/The model openai\/retired-model isn't available/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Model' })).toHaveAttribute(
      'href',
      `/acme/agents/${RETIRED_MODEL_AGENT_ID}/model`,
    )
    expect(await publishButton()).toBeDisabled()
    expect(screen.getByText('Fix 1 item above before publishing.')).toBeVisible()
  })

  it('asks for instructions before a first publish', async () => {
    mockAgentId = DRAFT_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText('Add instructions so the agent knows what to do.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open Instructions' })).toBeVisible()
    expect(await publishButton()).toBeDisabled()
    expect(screen.getByText('This is the first version of the agent.')).toBeVisible()
  })

  it('names the team a model is not allowed for once the team is added', async () => {
    const { user } = renderAgentEditor()
    await screen.findByText('Ready to publish.')
    await user.click(await screen.findByRole('combobox', { name: 'Add people or teams' }))
    await user.click(await screen.findByRole('option', { name: /Sales/ }))
    expect(await screen.findByText(/The model isn't allowed for Sales/)).toBeVisible()
    expect(await publishButton()).toBeDisabled()
  })

  it('explains a checklist that could not be loaded, and loads it again', async () => {
    useScenarioFor(server, 'GET', 'error', '/readiness')
    const { user } = renderAgentEditor()
    expect(await screen.findByText("Couldn't check readiness")).toBeVisible()
    expect(await publishButton()).toBeDisabled()
    server.events.removeAllListeners()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Ready to publish.')).toBeVisible()
  })
})

describe('PublishTab audience', () => {
  it('lists who can use the agent', async () => {
    renderAgentEditor()
    const section = await screen.findByRole('region', { name: 'Who can use it' })
    expect(await within(section).findByText('Support')).toBeVisible()
    expect(
      within(section).getByRole('combobox', { name: 'What Support can do' }),
    ).toHaveTextContent('Can use')
  })

  it('adds everyone, and takes a team away, at once', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('combobox', { name: 'Add people or teams' }))
    await user.click(await screen.findByRole('option', { name: /Everyone in the organization/ }))
    expect(await screen.findByText('Everyone in the organization')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove Support' }))
    await waitFor(() => {
      expect(screen.queryByText('Support')).not.toBeInTheDocument()
    })
    const response = await fetch(apiUrl(SUPPORT_AGENT_ID, 'access'))
    const { data } = (await response.json()) as { data: { entries: { subjectType: string }[] } }
    expect(data.entries.map((entry) => entry.subjectType)).toEqual(['organization'])
  })

  it('shows why an audience was refused', async () => {
    useScenarioFor(server, 'PUT', 'error', '/access')
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('combobox', { name: 'Add people or teams' }))
    await user.click(await screen.findByRole('option', { name: /Sales/ }))
    expect(await screen.findByText("Couldn't change who can use this agent")).toBeVisible()
    expect(screen.getByText(/model isn't allowed for everyone/)).toBeVisible()
  })

  it('changes nothing for someone who may only read the agent', async () => {
    mockAgentId = READ_ONLY_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByRole('heading', { name: 'Who can use it' })).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Add people or teams' })).not.toBeInTheDocument()
    expect(await publishButton()).toBeDisabled()
    expect(screen.getByText("You can't publish this agent.")).toBeVisible()
  })
})

describe('PublishTab channels', () => {
  it('tells when SurefyOS chat goes live, and shows how to call the API', async () => {
    const { user } = renderAgentEditor()
    expect(await screen.findByText('SurefyOS chat')).toBeVisible()
    await user.click(await screen.findByRole('switch', { name: 'Turn on the API' }))
    expect(
      await screen.findByText(
        /Anyone with a key that can run agents can get answers from Help center/,
      ),
    ).toBeVisible()
    expect(screen.getByText(/60 requests a minute/)).toBeVisible()
    expect(
      screen.getAllByText(new RegExp(`/api/v1/orgs/${ORG_ID}/agents/${SUPPORT_AGENT_ID}/runs`))
        .length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/stream=true/, { selector: 'code, pre, span' })).toBeVisible()
  })

  it('sends an Admin to Settings to create a key', async () => {
    const { user } = renderAgentEditor('admin')
    await user.click(await screen.findByRole('switch', { name: 'Turn on the API' }))
    expect(await screen.findByRole('link', { name: 'Create a key' })).toHaveAttribute(
      'href',
      '/acme/settings/api-keys',
    )
  })

  it('tells a Builder to ask an admin for a key', async () => {
    const { user } = renderAgentEditor('builder')
    await user.click(await screen.findByRole('switch', { name: 'Turn on the API' }))
    expect(await screen.findByText('Ask an admin for a key in Settings › API keys.')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Create a key' })).not.toBeInTheDocument()
  })
})

describe('PublishTab publishing', () => {
  it('lists what will be published against the live version', async () => {
    renderAgentEditor()
    expect(await screen.findByRole('heading', { name: 'Changes since version 3' })).toBeVisible()
    expect(await screen.findByText('Instructions changed')).toBeVisible()
    expect(screen.getByText('Creativity 30% → 50%')).toBeVisible()
  })

  it('publishes the draft as the next version, with its notes', async () => {
    const { user } = renderAgentEditor()
    await screen.findByText('Ready to publish.')
    await user.type(
      screen.getByRole('textbox', { name: /Notes for this version/ }),
      'Handles refunds',
    )
    await user.click(await publishButton())
    expect((await screen.findAllByText('Version 4 is live')).length).toBeGreaterThan(0)
    expect(
      (await screen.findAllByText('Nothing has changed since the live version.')).length,
    ).toBeGreaterThan(0)
    const [latest] = await readVersions(SUPPORT_AGENT_ID)
    expect(latest).toMatchObject({ version: 4, notes: 'Handles refunds' })
  })

  it('turns the API on with the publish, and tells when an admin must approve it', async () => {
    useScenarioFor(server, 'POST', 'pending-approval', '/publish')
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('switch', { name: 'Turn on the API' }))
    await user.click(await publishButton())
    expect(
      await screen.findByText('Waiting for an admin to approve publishing to the API', {
        selector: 'p, div, span',
      }),
    ).toBeVisible()
    expect(screen.getAllByText('Version 4 is live').length).toBeGreaterThan(0)
  })

  it('keeps the previous version live and offers a retry when publishing fails', async () => {
    useScenarioFor(server, 'POST', 'error', '/publish')
    const { user } = renderAgentEditor()
    await screen.findByText('Ready to publish.')
    await user.click(await publishButton())
    expect(await screen.findByText("Couldn't publish")).toBeVisible()
    expect(screen.getByText(/The previous version stays live/)).toBeVisible()
    expect(screen.getByText('Version 3 is live')).toBeVisible()

    server.events.removeAllListeners()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await screen.findAllByText('Version 4 is live')).length).toBeGreaterThan(0)
  })

  it('shows the edit conflict when the draft moved while the person was here', async () => {
    const { user } = renderAgentEditor()
    await screen.findByText('Ready to publish.')
    const saved = await readSavedAgent(SUPPORT_AGENT_ID)
    // another builder saves the draft first
    await fetch(apiUrl(SUPPORT_AGENT_ID, 'draft'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseRevision: saved.draft.revision,
        definition: { ...saved.draft.definition, tone: 'Formal' },
      }),
    })
    await user.click(await publishButton())
    expect(await screen.findByText(/changed this agent while you were editing/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeVisible()
    expect(await readVersions(SUPPORT_AGENT_ID)).toHaveLength(3)
  })

  it('does not offer a publish when nothing has changed', async () => {
    const { user } = renderAgentEditor()
    await screen.findByText('Ready to publish.')
    await user.click(await publishButton())
    await screen.findAllByText('Version 4 is live')
    expect(await publishButton()).toBeDisabled()
    expect(
      screen.getByText('Nothing has changed since the live version.', { selector: 'span' }),
    ).toBeVisible()
  })
})
