// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { callApi, currentOrgId } from './api'
import { ORGANIZATION, modelServerUrl, oauthServerUrl, OWNER_STATE } from './env'
import { removeStubModel } from './models'

import type { Browser, Page } from '@playwright/test'

/** The refund tool's name: Guard's rules and the stub model both know it. */
export const REFUND_TOOL = 'refund_api'

/** Refunds above this amount need a person (the approval rule `arrangeRefundAgent` adds). */
export const APPROVAL_ABOVE = 200

interface AgentDraft {
  revision: number
  definition: Record<string, unknown>
}

export interface RefundAgent {
  orgId: string
  agentId: string
  /** Deleting a published agent asks for its name. */
  name: string
  /** The model the agent was arranged with. */
  modelKey: string
  ruleId: string
  /** The approval rule's name, which an approval shows as the rule that asked. */
  ruleName: string
}

/**
 * Arranges what an Admin would build in the editor and in Guard, through the API: an agent with
 * one `can_act` API tool that posts refunds to the stub app, and an organization approval rule for
 * refunds above `APPROVAL_ABOVE`. Returns the ids the spec needs.
 */
export async function arrangeRefundAgent(
  page: Page,
  options: { name: string; modelKey: string; permission?: 'ask_first' | 'can_act' },
): Promise<RefundAgent> {
  const orgId = await currentOrgId(page)
  const agent = await callApi<{ id: string }>(page, 'POST', `/orgs/${orgId}/agents`, {
    name: options.name,
    modelKey: options.modelKey,
  })
  const draftPath = `/orgs/${orgId}/agents/${agent.id}/draft`
  const draft = await callApi<AgentDraft>(page, 'GET', draftPath)
  await callApi(page, 'PUT', draftPath, {
    baseRevision: draft.revision,
    definition: {
      ...draft.definition,
      instructions: 'Refund orders when asked.',
      tools: [
        {
          id: randomUUID(),
          kind: 'api',
          name: REFUND_TOOL,
          description: 'Refunds an order',
          permission: options.permission ?? 'can_act',
          enabled: true,
          method: 'POST',
          url: `${oauthServerUrl}/api/refunds`,
          headers: [],
          inputSchema: {
            type: 'object',
            properties: { orderId: { type: 'string' }, amount: { type: 'number' } },
            required: ['orderId', 'amount'],
          },
          connectionId: null,
        },
      ],
    },
  })
  const ruleName = `Refunds above ${String(APPROVAL_ABOVE)} ${options.name}`
  const rule = await callApi<{ id: string }>(page, 'POST', `/orgs/${orgId}/guard/guardrails`, {
    name: ruleName,
    scope: 'organization',
    definition: {
      version: 1,
      kind: 'approval_rule',
      match: {
        action: REFUND_TOOL,
        conditions: [{ field: 'amount', operator: 'gt', value: APPROVAL_ABOVE }],
      },
      approvers: [{ type: 'role', id: 'admin' }],
      waitMinutes: null,
      onTimeout: null,
      escalateTo: [],
      risk: 'medium',
    },
  })
  return {
    orgId,
    agentId: agent.id,
    name: options.name,
    modelKey: options.modelKey,
    ruleId: rule.id,
    ruleName,
  }
}

/**
 * Gives the arranged agent its own Guard rules (a blocked action and thresholds equal to the
 * defaults) and publishes it, as a Builder would from the Guard and Publish tabs.
 */
export async function publishWithOwnRules(page: Page, agent: RefundAgent): Promise<void> {
  const draftPath = `/orgs/${agent.orgId}/agents/${agent.agentId}/draft`
  const draft = await callApi<AgentDraft>(page, 'GET', draftPath)
  const definition = draft.definition as { guard: Record<string, unknown> }
  await callApi(page, 'PUT', draftPath, {
    baseRevision: draft.revision,
    definition: {
      ...draft.definition,
      guard: {
        ...definition.guard,
        thresholds: { autoBp: 9000, reviewBp: 6000 },
        blockedActions: [{ id: 'no-delete', match: { action: 'records.delete' } }],
      },
    },
  })
  const current = await callApi<AgentDraft>(page, 'GET', draftPath)
  await callApi(page, 'POST', `/orgs/${agent.orgId}/agents/${agent.agentId}/publish`, {
    baseRevision: current.revision,
  })
}

interface RunDto {
  id: string
  status: string
  errorCode: string | null
}

/** Points the agent's draft at another model, as the editor's model picker does. */
export async function useModel(page: Page, agent: RefundAgent, modelKey: string): Promise<void> {
  const draftPath = `/orgs/${agent.orgId}/agents/${agent.agentId}/draft`
  const draft = await callApi<AgentDraft>(page, 'GET', draftPath)
  const { model } = draft.definition as { model: Record<string, unknown> }
  await callApi(page, 'PUT', draftPath, {
    baseRevision: draft.revision,
    definition: { ...draft.definition, model: { ...model, modelKey } },
  })
}

/** Starts a test run of the agent's draft and returns the queued run's id. */
export async function startTestRun(page: Page, agent: RefundAgent, text: string): Promise<string> {
  const run = await callApi<RunDto>(
    page,
    'POST',
    `/orgs/${agent.orgId}/agents/${agent.agentId}/test-runs`,
    { messages: [{ role: 'user', text }] },
  )
  return run.id
}

export const readRun = (page: Page, agent: RefundAgent, runId: string) =>
  callApi<RunDto>(page, 'GET', `/orgs/${agent.orgId}/runs/${runId}`)

/** The stub app's refunds so far, as the agent's tool posted them. */
export async function refundsSoFar(page: Page): Promise<{ orderId: string; amount: number }[]> {
  const response = await page.request.get(`${oauthServerUrl}/control/refunds`)
  return (await response.json()) as { orderId: string; amount: number }[]
}

/**
 * Takes down what `arrangeRefundAgent` and `connectStubModel` set up, signed in as the Owner: the
 * agent and the stub model server. For `afterAll`, so the specs that expect an organization
 * without agents or a model (Chat, Vault) find it as setup left it.
 */
export async function cleanUp(browser: Browser, agent: RefundAgent | undefined): Promise<void> {
  const context = await browser.newContext({ storageState: OWNER_STATE })
  try {
    const page = await context.newPage()
    await page.goto(`/${ORGANIZATION.slug}/chat`)
    if (agent) {
      // a published agent is deleted with its name and a reason; a draft ignores both
      const confirm = `confirmName=${encodeURIComponent(agent.name)}&reason=cleanup`
      await callApi(page, 'DELETE', `/orgs/${agent.orgId}/agents/${agent.agentId}?${confirm}`)
    }
    await removeStubModel(page)
  } finally {
    await context.close()
  }
}

/** The text of every request the stub model server was sent so far (what the "provider" saw). */
export async function receivedByModel(page: Page): Promise<string[]> {
  const response = await page.request.get(`${modelServerUrl}/control/requests`)
  return (await response.json()) as string[]
}

/** Forgets the requests the stub model server was sent, so a spec reads only its own. */
export async function forgetModelRequests(page: Page): Promise<void> {
  await page.request.delete(`${modelServerUrl}/control/requests`)
}
