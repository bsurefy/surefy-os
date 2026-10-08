// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { agentEditorHandlers, renderAgentEditor, useScenarioFor } from '@/test/agentEditor'
import { ORG_ID } from '@/test/shell'
import { setupTestServer } from '@surefy/web-core/testing'

import { setRunStreamDelay } from '../../../../../mock/handlers/agentRuns'
import {
  READ_ONLY_AGENT_ID,
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
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'test' }),
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

async function ask(text: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByRole('textbox', { name: 'Message to the agent' }), text)
  await user.click(screen.getByRole('button', { name: 'Send' }))
  return user
}

const steps = () => within(screen.getByRole('list', { name: 'Steps' }))

describe('TestTab conversation', () => {
  it('invites a first message, with the conversation starters of the draft', async () => {
    renderAgentEditor()
    expect(await screen.findByText('Say something to the agent')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Where is my order?' })).toBeVisible()
    expect(screen.getByText('No steps yet')).toBeVisible()
  })

  it('sends a message and shows the answer with the steps behind it', async () => {
    renderAgentEditor()
    await ask('Where is my order?')
    expect(await screen.findByText(/Your order ships within two business days/)).toBeVisible()
    expect(await steps().findByText('Search Help center')).toBeVisible()
    expect(await steps().findByText('GPT-4.1')).toBeVisible()
    // the two steps and the run itself are done
    await waitFor(() => {
      expect(screen.getAllByText('Done')).toHaveLength(3)
    })
  })

  it('sends a conversation starter at once', async () => {
    renderAgentEditor()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'How do I get a refund?' }))
    expect(await screen.findByText('You')).toBeVisible()
    expect(await steps().findByText('Refund API')).toBeVisible()
  })

  it('starts again with New test', async () => {
    renderAgentEditor()
    const user = await ask('Where is my order?')
    await screen.findByText(/Your order ships/)
    await user.click(screen.getByRole('button', { name: 'New test' }))
    expect(await screen.findByText('Say something to the agent')).toBeVisible()
    expect(screen.queryByText(/Your order ships/)).not.toBeInTheDocument()
  })

  it('opens a step to show its input and output', async () => {
    renderAgentEditor()
    const user = await ask('Where is my order?')
    await steps().findByText('Search Help center')
    await user.click(
      screen.getByRole('button', { name: 'Show the input and output of Search Help center' }),
    )
    expect(await screen.findByText('Output')).toBeVisible()
    expect(screen.getByText(/Refund policy/)).toBeVisible()
  })

  it('cannot be used on an agent that is read-only', async () => {
    mockAgentId = READ_ONLY_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText(/it can't be tested here/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  })
})

describe('TestTab approvals', () => {
  it('waits for an approval and goes on once it is approved as tester', async () => {
    renderAgentEditor()
    const user = await ask('I would like a refund')
    expect(await steps().findByText('Waiting')).toBeVisible()
    expect(screen.getByText('Waiting for approval by Maya Okafor')).toBeVisible()
    expect(screen.getByText('Waiting for approval')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Approve as tester' }))
    expect(await screen.findByText(/I have refunded \$120\.00/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve as tester' })).not.toBeInTheDocument()
  })
})

describe('TestTab failures', () => {
  it('shows the failed tool step and runs it again from there with Retry step', async () => {
    renderAgentEditor()
    const user = await ask('When does my order arrive?')
    expect(await screen.findByText('This tool call failed')).toBeVisible()
    expect(
      screen.getAllByText("A tool the agent used didn't answer in time.").length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Open tool settings' })).toHaveAttribute(
      'href',
      `/acme/agents/${SUPPORT_AGENT_ID}/tools`,
    )

    await user.click(screen.getByRole('button', { name: 'Retry step' }))
    expect(await screen.findByText(/arrives on Friday/)).toBeVisible()
    // the steps before the failed one were reused
    expect(steps().getAllByText('Reused')).toHaveLength(2)
    expect(screen.queryByText('This tool call failed')).not.toBeInTheDocument()
  })

  it('says so when the run cannot start', async () => {
    useScenarioFor(server, 'POST', 'error', '/test-runs')
    renderAgentEditor()
    await ask('Where is my order?')
    await waitFor(() => {
      expect(screen.getByText('The run failed')).toBeVisible()
    })
  })
})

describe('TestTab and publishing', () => {
  it('counts as a test run for the readiness of the draft', async () => {
    renderAgentEditor()
    await ask('Where is my order?')
    await screen.findByText(/Your order ships/)
    const response = await fetch(
      `http://localhost:3000/api/v1/orgs/${ORG_ID}/agents/${SUPPORT_AGENT_ID}/readiness`,
    )
    const { data } = (await response.json()) as {
      data: { items: { key: string; passed: boolean }[] }
    }
    expect(data.items.find((item) => item.key === 'tested_since_change')?.passed).toBe(true)
  })
})
