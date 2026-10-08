// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  agentEditorHandlers,
  readSavedAgent,
  renderAgentEditor,
  updateSavedDraft,
  useScenarioFor,
} from '@/test/agentEditor'
import type { AgentDefinition } from '@surefy/contracts'
import { fixtureUuid, setupTestServer } from '@surefy/web-core/testing'

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
  useParams: () => ({ orgSlug: 'acme', agentId: mockAgentId, tab: 'guard' }),
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
})

afterEach(() => {
  server.events.removeAllListeners()
})

const savedGuard = async () => (await readSavedAgent(SUPPORT_AGENT_ID)).draft.definition.guard

const refundTool = (permission: 'read_only' | 'can_act'): AgentDefinition['tools'][number] => ({
  id: fixtureUuid(90, 1),
  name: 'Refund API',
  description: 'Refunds an order',
  permission,
  enabled: true,
  kind: 'api',
  method: 'POST',
  url: 'https://example.com/refund',
  headers: [],
  inputSchema: null,
  connectionId: null,
})

describe('GuardTab inherited rows', () => {
  it('shows the organization thresholds and rules as locked rows', async () => {
    renderAgentEditor()
    expect(await screen.findByText('Confidence thresholds')).toBeVisible()
    expect(
      screen.getByText(
        'Automatic from 90% · AI double-check from 60% · below that a person decides',
      ),
    ).toBeVisible()
    expect(screen.getByText('Refunds above $200 need approval')).toBeVisible()
    expect(screen.getByText(/Locked by Omar Haddad: Required by finance/)).toBeVisible()
    expect(screen.getByText(/Team Sales/)).toBeVisible()
    expect(screen.getByText('Off')).toBeVisible()
    // agent rules are edited here, not inherited
    expect(screen.queryByText('Support triage: ask before refunds')).not.toBeInTheDocument()
  })

  it('explains a failure to load them, and tries again', async () => {
    useScenarioFor(server, 'GET', 'error', '/guard/')
    const { user } = renderAgentEditor()
    expect(await screen.findByText("Couldn't load the organization's Guard rules")).toBeVisible()
    server.events.removeAllListeners()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Confidence thresholds')).toBeVisible()
  })
})

describe('GuardTab thresholds', () => {
  it('follows the organization by default', async () => {
    renderAgentEditor()
    expect(
      await screen.findByRole('switch', { name: "Use the organization's thresholds" }),
    ).toBeChecked()
    expect(screen.queryByRole('textbox', { name: 'Automatic from' })).not.toBeInTheDocument()
    expect(
      await screen.findByText(
        'This agent acts on its own from 90%, gets a double-check from 60% and asks a person below that.',
      ),
    ).toBeVisible()
  })

  it('sets its own, starting from the organization and going up', async () => {
    const { user } = renderAgentEditor()
    await user.click(
      await screen.findByRole('switch', { name: "Use the organization's thresholds" }),
    )
    const auto = await screen.findByRole('textbox', { name: 'Automatic from' })
    expect(auto).toHaveValue('90')
    await user.clear(auto)
    await user.type(auto, '95')
    await user.tab()
    await waitFor(async () => {
      expect((await savedGuard()).thresholds).toEqual({ autoBp: 9500, reviewBp: 6000 })
    })
  })

  it('does not go below the organization, and says what the lowest is', async () => {
    const { user } = renderAgentEditor()
    await user.click(
      await screen.findByRole('switch', { name: "Use the organization's thresholds" }),
    )
    const auto = await screen.findByRole('textbox', { name: 'Automatic from' })
    await user.clear(auto)
    await user.type(auto, '70')
    await user.tab()
    expect(auto).toHaveValue('90')
    expect(
      screen.getByText(
        "The organization's thresholds (90% and 60%) are the lowest this agent can use.",
      ),
    ).toBeVisible()
    await waitFor(async () => {
      expect((await savedGuard()).thresholds).toEqual({ autoBp: 9000, reviewBp: 6000 })
    })
  })

  it('goes back to the organization, which clears its own', async () => {
    await updateSavedDraft(SUPPORT_AGENT_ID, (definition) => ({
      ...definition,
      guard: { ...definition.guard, thresholds: { autoBp: 9500, reviewBp: 7000 } },
    }))
    const { user } = renderAgentEditor()
    const follow = await screen.findByRole('switch', { name: "Use the organization's thresholds" })
    expect(follow).not.toBeChecked()
    await user.click(follow)
    await waitFor(async () => {
      expect((await savedGuard()).thresholds).toBeNull()
    })
  })

  it('warns when its own are lower than the organization raised them to', async () => {
    await updateSavedDraft(SUPPORT_AGENT_ID, (definition) => ({
      ...definition,
      guard: { ...definition.guard, thresholds: { autoBp: 8000, reviewBp: 5000 } },
    }))
    const { user } = renderAgentEditor()
    expect(await screen.findByText("Lower than the organization's now")).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Raise to match' }))
    await waitFor(async () => {
      expect((await savedGuard()).thresholds).toEqual({ autoBp: 9000, reviewBp: 6000 })
    })
    expect(screen.queryByText("Lower than the organization's now")).not.toBeInTheDocument()
  })
})

describe('GuardTab approval rules', () => {
  it('starts with none', async () => {
    renderAgentEditor()
    expect(await screen.findByText('No approval rules for this agent')).toBeVisible()
  })

  it('adds a rule with its approvers, wait and what happens on timeout', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('button', { name: 'Add approval rule' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Action' }), 'Refund API')
    await user.click(within(dialog).getByRole('button', { name: 'Save rule' }))
    expect(await screen.findByText('Ask first: Refund API')).toBeVisible()
    expect(screen.getByText('Decided by Admins and Owners')).toBeVisible()
    expect(screen.getByText('Waits 1 hour, then rejects')).toBeVisible()
    await waitFor(async () => {
      const [rule] = (await savedGuard()).approvalRules
      expect(rule).toMatchObject({
        match: { action: 'Refund API' },
        approvers: [{ type: 'role', id: 'admin' }],
        waitMinutes: 60,
        onTimeout: 'reject',
        risk: 'medium',
      })
    })
  })

  it('needs an action and someone to decide', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('button', { name: 'Add approval rule' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove Admins and Owners' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save rule' }))
    expect(await within(dialog).findByText('Choose at least one approver.')).toBeVisible()
    expect(screen.queryByText(/Ask first:/)).not.toBeInTheDocument()
  })

  it('asks who to escalate to when the rule escalates', async () => {
    const { user } = renderAgentEditor()
    await user.click(await screen.findByRole('button', { name: 'Add approval rule' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Action' }), 'Refund API')
    await user.click(within(dialog).getByRole('combobox', { name: 'When nobody answers in time' }))
    await user.click(await screen.findByRole('option', { name: 'Escalate to someone else' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save rule' }))
    expect(await within(dialog).findByText('Choose who to escalate to.')).toBeVisible()
  })

  it('edits a rule, with a wait in days and an escalation', async () => {
    await updateSavedDraft(SUPPORT_AGENT_ID, (definition) => ({
      ...definition,
      guard: {
        ...definition.guard,
        approvalRules: [
          {
            id: 'refund-approval',
            match: { action: 'Refund API' },
            approvers: [{ type: 'role', id: 'admin' }],
            waitMinutes: null,
            onTimeout: null,
            escalateTo: [],
            risk: 'high',
          },
        ],
      },
    }))
    const { user } = renderAgentEditor()
    expect(await screen.findByText('Waits until someone decides')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit the rule for Refund API' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('switch', { name: /Stop waiting after a while/ }))
    const amount = within(dialog).getByRole('textbox', { name: 'Wait for' })
    await user.clear(amount)
    await user.type(amount, '2')
    await user.click(within(dialog).getByRole('combobox', { name: 'Unit' }))
    await user.click(await screen.findByRole('option', { name: 'Days' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save rule' }))
    expect(await screen.findByText('Waits 2 days, then rejects')).toBeVisible()
    await waitFor(async () => {
      const [rule] = (await savedGuard()).approvalRules
      expect(rule).toMatchObject({ id: 'refund-approval', waitMinutes: 2880, onTimeout: 'reject' })
    })
  })

  it('removes a rule', async () => {
    await updateSavedDraft(SUPPORT_AGENT_ID, (definition) => ({
      ...definition,
      guard: {
        ...definition.guard,
        approvalRules: [
          {
            id: 'r1',
            match: { action: 'Refund API' },
            approvers: [{ type: 'role', id: 'owner' }],
            waitMinutes: 120,
            onTimeout: 'escalate',
            escalateTo: [{ type: 'role', id: 'admin' }],
            risk: 'low',
          },
        ],
      },
    }))
    const { user } = renderAgentEditor()
    expect(await screen.findByText('Waits 2 hours, then escalates')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove the rule for Refund API' }))
    expect(await screen.findByText('No approval rules for this agent')).toBeVisible()
    await waitFor(async () => {
      expect((await savedGuard()).approvalRules).toEqual([])
    })
  })

  it('suggests a rule for a tool that can act, with the action filled in', async () => {
    await updateSavedDraft(SUPPORT_AGENT_ID, (definition) => ({
      ...definition,
      tools: [refundTool('can_act')],
    }))
    const { user } = renderAgentEditor()
    expect(await screen.findByText('Refund API can act on its own')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add a rule for Refund API' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: 'Action' })).toHaveValue('Refund API')
    await user.click(within(dialog).getByRole('button', { name: 'Save rule' }))
    await waitFor(() => {
      expect(screen.queryByText('Refund API can act on its own')).not.toBeInTheDocument()
    })
    // let the autosave finish, so it does not reach the next test
    await waitFor(async () => {
      expect((await savedGuard()).approvalRules).toHaveLength(1)
    })
  })

  it('does not suggest a rule for a tool that only reads', async () => {
    await updateSavedDraft(SUPPORT_AGENT_ID, (definition) => ({
      ...definition,
      tools: [refundTool('read_only')],
    }))
    renderAgentEditor()
    await screen.findByText('No approval rules for this agent')
    expect(screen.queryByText('Refund API can act on its own')).not.toBeInTheDocument()
  })
})

describe('GuardTab blocked actions', () => {
  it('blocks an action, once, and unblocks it', async () => {
    const { user } = renderAgentEditor()
    expect(await screen.findByText('Nothing is blocked for this agent.')).toBeVisible()
    const field = screen.getByRole('textbox', { name: 'Block an action' })
    await user.type(field, 'Delete record')
    await user.click(screen.getByRole('button', { name: 'Block' }))
    expect(await screen.findByText('Delete record')).toBeVisible()
    await user.type(field, 'delete record')
    await user.click(screen.getByRole('button', { name: 'Block' }))
    expect(screen.getAllByText(/^Delete record$/i)).toHaveLength(1)
    await waitFor(async () => {
      expect((await savedGuard()).blockedActions).toHaveLength(1)
    })

    await user.click(screen.getByRole('button', { name: 'Unblock Delete record' }))
    expect(await screen.findByText('Nothing is blocked for this agent.')).toBeVisible()
  })
})

describe('GuardTab for someone who cannot edit', () => {
  it('shows the rules and offers nothing to change', async () => {
    mockAgentId = READ_ONLY_AGENT_ID
    renderAgentEditor()
    expect(await screen.findByText('Confidence thresholds')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Add approval rule' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Block an action' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: "Use the organization's thresholds" })).toBeDisabled()
  })
})
