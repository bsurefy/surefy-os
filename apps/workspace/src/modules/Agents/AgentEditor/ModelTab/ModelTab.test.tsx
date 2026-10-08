// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { agentEditorHandlers, readSavedAgent, renderAgentEditor } from '@/test/agentEditor'
import { setupTestServer } from '@surefy/web-core/testing'

import {
  ARCHIVED_AGENT_ID,
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
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'model' }),
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

afterEach(() => {
  server.events.removeAllListeners()
})

describe('ModelTab', () => {
  it('shows the chosen model and where its data goes', async () => {
    renderAgentEditor()
    const model = await screen.findByRole('combobox', { name: 'Model' })
    await waitFor(() => {
      expect(model).toHaveTextContent('GPT-4.1')
    })
    expect(await screen.findByText('Sent to openai')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Creativity' })).toHaveValue('50')
  })

  it('lists only the models the person may use, with cost and where the data goes', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('combobox', { name: 'Model' }))
    const list = await screen.findByRole('listbox')
    expect(within(list).getByRole('option', { name: /GPT-4\.1 mini/ })).toBeVisible()
    expect(
      within(list).getByRole('option', { name: /llama3\.1:70b.*Stays on your server/ }),
    ).toBeVisible()
    // embedding models are not for answering
    expect(within(list).queryByRole('option', { name: /embedding/i })).not.toBeInTheDocument()
    // Auto arrives later and cannot be picked yet
    expect(within(list).getByRole('option', { name: /Auto/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('saves another model', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('combobox', { name: 'Model' }))
    await user.click(await screen.findByRole('option', { name: /Claude Sonnet 4/ }))
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Claude Sonnet 4')
    await waitFor(async () => {
      expect((await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition.model.modelKey).toBe(
        'anthropic/claude-sonnet-4',
      )
    })
  })

  it('saves creativity as a share from 0 to 1', async () => {
    const { user } = renderAgentEditor()
    const creativity = await screen.findByRole('textbox', { name: 'Creativity' })
    await user.clear(creativity)
    await user.type(creativity, '80')
    await user.tab()
    await waitFor(async () => {
      expect(
        (await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition.model.creativity,
      ).toBeCloseTo(0.8)
    })
  })

  it('chooses the double-check model, and none again', async () => {
    const { user } = renderAgentEditor()
    expect(
      await screen.findByRole('combobox', { name: 'AI double-check model' }),
    ).toHaveTextContent('No double-check model')
    await user.click(screen.getByRole('combobox', { name: 'AI double-check model' }))
    await user.click(await screen.findByRole('option', { name: /GPT-4\.1 mini/ }))
    await waitFor(async () => {
      expect(
        (await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition.model.doubleCheckModelKey,
      ).toBe('openai/gpt-4.1-mini')
    })

    await user.click(screen.getByRole('combobox', { name: 'AI double-check model' }))
    await user.click(await screen.findByRole('option', { name: 'No double-check model' }))
    await waitFor(async () => {
      expect(
        (await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition.model.doubleCheckModelKey,
      ).toBeNull()
    })
  })

  it('saves the Vault fallback switch', async () => {
    const { user } = renderAgentEditor()
    const fallback = await screen.findByRole('switch', { name: /Use the Vault fallback order/ })
    expect(fallback).toBeChecked()
    await user.click(fallback)
    expect(fallback).not.toBeChecked()
    await waitFor(async () => {
      expect((await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition.model.useVaultFallback).toBe(
        false,
      )
    })
  })

  it('warns when the model is no longer allowed and keeps its name visible', async () => {
    mockAgentId = RETIRED_MODEL_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText('Model removed by an admin')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'openai/retired-model',
    )
  })

  it('shows an archived agent without letting the model change', async () => {
    mockAgentId = ARCHIVED_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByRole('combobox', { name: 'Model' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: /Use the Vault fallback order/ })).toBeDisabled()
  })
})
