// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  agentEditorHandlers,
  leaveAgentEditor,
  readSavedAgent,
  renderAgentEditor,
} from '@/test/agentEditor'
import { setupTestServer } from '@surefy/web-core/testing'

import {
  DRAFT_AGENT_ID,
  READ_ONLY_AGENT_ID,
  resetAgentsMock,
  SUPPORT_AGENT_ID,
} from '../../../../../mock/handlers/agents'
import {
  HELP_CENTER_ID,
  HR_POLICIES_ID,
  resetKnowledgeMock,
} from '../../../../../mock/handlers/knowledge'
import { resetModelsMock } from '../../../../../mock/handlers/models'
import { resetTeamsMock } from '../../../../../mock/handlers/teams'
import { resetVaultMock } from '../../../../../mock/handlers/vault'

import type * as AgentEditorConstants from '../AgentEditor.constants'

let mockAgentId = SUPPORT_AGENT_ID

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'knowledge' }),
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

const savedIds = async (agentId: string) =>
  (await readSavedAgent(agentId)).draft.definition.knowledge.knowledgeBaseIds

describe('KnowledgeTab', () => {
  it('lists the knowledge bases the agent searches', async () => {
    renderAgentEditor()
    const helpCenter = (await screen.findByText('Help center')).closest('li')
    expect(helpCenter).not.toBeNull()
    expect(within(helpCenter as HTMLElement).getByText(/source/)).toBeVisible()
    expect(screen.getByRole('switch', { name: /Cite sources/ })).toBeChecked()
    expect(screen.getByRole('switch', { name: /Only answer from knowledge/ })).not.toBeChecked()
  })

  it('adds a knowledge base and offers only the ones not added yet', async () => {
    const { user } = renderAgentEditor()
    await screen.findByText('Help center')
    await user.click(screen.getByRole('combobox', { name: 'Add a knowledge base' }))
    const list = await screen.findByRole('listbox')
    expect(within(list).queryByRole('option', { name: /Help center/ })).not.toBeInTheDocument()
    // deleted bases are never offered
    expect(within(list).queryByRole('option', { name: /Old wiki/ })).not.toBeInTheDocument()
    await user.click(within(list).getByRole('option', { name: /HR Policies/ }))
    expect(await screen.findByText('HR Policies')).toBeVisible()
    await waitFor(async () => {
      expect(await savedIds(SUPPORT_AGENT_ID)).toEqual([HELP_CENTER_ID, HR_POLICIES_ID])
    })
  })

  it('removes a knowledge base', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('button', { name: 'Remove Help center' }))
    expect(await screen.findByText('No knowledge attached')).toBeVisible()
    await waitFor(async () => {
      expect(await savedIds(SUPPORT_AGENT_ID)).toEqual([])
    })
  })

  it('saves "Cite sources" and "Only answer from knowledge"', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('switch', { name: /Cite sources/ }))
    await user.click(screen.getByRole('switch', { name: /Only answer from knowledge/ }))
    await waitFor(async () => {
      const { knowledge } = (await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition
      expect(knowledge.citeSources).toBe(false)
      expect(knowledge.onlyFromKnowledge).toBe(true)
    })
  })

  it('invites a new agent to attach its first knowledge base', async () => {
    mockAgentId = DRAFT_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText('No knowledge attached')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Add a knowledge base' })).toBeEnabled()
    })
  })

  it('shows a read-only agent’s knowledge without anything to change', async () => {
    mockAgentId = READ_ONLY_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText('HR Policies')).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Add a knowledge base' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Cite sources/ })).toBeDisabled()
  })
})
