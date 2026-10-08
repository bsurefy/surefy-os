// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { agentEditorHandlers, readSavedAgent, renderAgentEditor } from '@/test/agentEditor'
import { setupTestServer } from '@surefy/web-core/testing'

import { resetAgentsMock, SUPPORT_AGENT_ID } from '../../../../../mock/handlers/agents'
import { resetKnowledgeMock } from '../../../../../mock/handlers/knowledge'
import { resetModelsMock } from '../../../../../mock/handlers/models'
import { resetTeamsMock } from '../../../../../mock/handlers/teams'
import { resetVaultMock } from '../../../../../mock/handlers/vault'

import type * as AgentEditorConstants from '../AgentEditor.constants'

vi.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'acme', agentId: SUPPORT_AGENT_ID, tab: 'instructions' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../AgentEditor.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentEditorConstants>()),
  AUTOSAVE_DELAY_MS: 20,
}))

const server = setupTestServer(...agentEditorHandlers)

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

describe('InstructionsTab', () => {
  it('shows the name, description, instructions, tone and starters of the draft', async () => {
    renderAgentEditor()
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Support triage')
    expect(screen.getByRole('textbox', { name: /Description/ })).toHaveValue(
      'Answers order and refund questions from the help center.',
    )
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Instructions' }).value,
    ).toContain('You answer customer questions about orders and refunds.')
    expect(screen.getByRole('textbox', { name: /Tone of voice/ })).toHaveValue(
      'Friendly and concise',
    )
    expect(screen.getByRole('textbox', { name: 'Conversation starter 1' })).toHaveValue(
      'Where is my order?',
    )
    expect(screen.getByRole('textbox', { name: 'Conversation starter 2' })).toHaveValue(
      'How do I get a refund?',
    )
  })

  it('counts the characters of the instructions', async () => {
    renderAgentEditor()
    expect(await screen.findByText(/of 20000 characters/)).toBeVisible()
  })

  it('previews the agent as people see it in Chat, as the fields change', async () => {
    const { user } = renderAgentEditor()
    const preview = await screen.findByRole('complementary', { name: 'Preview' })
    expect(within(preview).getByText('Support triage')).toBeVisible()
    expect(within(preview).getByText('Where is my order?')).toBeVisible()

    const starter = screen.getByRole('textbox', { name: 'Conversation starter 1' })
    await user.clear(starter)
    await user.type(starter, 'Track my parcel')
    expect(within(preview).getByText('Track my parcel')).toBeVisible()
    expect(within(preview).queryByText('Where is my order?')).not.toBeInTheDocument()
  })

  it('adds and removes conversation starters, and leaves a blank one out of the save', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('button', { name: 'Add starter' }))
    expect(screen.getByRole('textbox', { name: 'Conversation starter 3' })).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Remove conversation starter 1' }))
    expect(screen.getByRole('textbox', { name: 'Conversation starter 1' })).toHaveValue(
      'How do I get a refund?',
    )

    // the blank row is not sent: what is saved is the one starter that has text
    await waitFor(async () => {
      expect(
        (await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition.conversationStarters,
      ).toEqual(['How do I get a refund?'])
    })
  })

  it('stops at six conversation starters', async () => {
    const { user } = renderAgentEditor()
    const add = await screen.findByRole('button', { name: 'Add starter' })
    for (let count = 2; count < 6; count += 1) {
      await user.click(add)
    }
    expect(add).toBeDisabled()
  })
})
