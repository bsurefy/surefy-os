// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  agentRunDetailDtoSchema,
  agentRunDtoSchema,
  agentRunStepDetailDtoSchema,
  agentRunStepsDtoSchema,
  AGENT_RUNS_ERROR_CODES,
  AGENTS_ERROR_CODES,
  ERROR_CODES,
} from '@surefy/contracts'

import { authHeaders, type AuthHeaders } from '../../../../test/helpers/auth.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'
import { setupAgents, type AgentsSetup, type Who } from '../../agents/__tests__/agentsTestKit.js'

export const runsUrl = (setup: AgentsSetup, path: string) => `/api/v1/orgs/${setup.a.id}${path}`

type Caller = (
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  query?: Record<string, string>,
) => ReturnType<typeof request>

/** One caller per person of A: each request goes through the app with that person's session. */
export async function callers(setup: AgentsSetup): Promise<Record<Who, Caller>> {
  const sessions: Record<Who, AuthHeaders> = {
    olivia: setup.sessionOf(setup.a.members.olivia),
    adam: setup.sessionOf(setup.a.members.adam),
    uma: setup.sessionOf(setup.a.members.uma),
    bella: await authHeaders(setup.app, setup.builders.bella),
    ben: await authHeaders(setup.app, setup.builders.ben),
  }
  const as =
    (who: Who): Caller =>
    (method, path, payload, query) =>
      request(setup.app, method, runsUrl(setup, path), {
        headers: sessions[who],
        ...(payload === undefined ? {} : { payload }),
        ...(query === undefined ? {} : { query }),
      })
  return {
    olivia: as('olivia'),
    adam: as('adam'),
    uma: as('uma'),
    bella: as('bella'),
    ben: as('ben'),
  }
}

const MESSAGE = { messages: [{ role: 'user', text: 'Where is order 1182?' }] }

/** A draft agent of Bella's with one test run started by her. */
async function withTestRun(setup: AgentsSetup) {
  const agent = await setup.create('bella')
  const as = await callers(setup)
  const { bella } = as
  const run = expectData(
    await bella('POST', `/agents/${agent.id}/test-runs`, MESSAGE),
    201,
    agentRunDetailDtoSchema,
  )
  return { agent, run, bella, as }
}

describe('starting a test run', () => {
  it('queues the run of the draft, with the input as its first step', async () => {
    const setup = await setupAgents()
    const { agent, run, bella } = await withTestRun(setup)

    expect(run).toMatchObject({
      agent: { id: agent.id },
      agentVersion: null,
      trigger: 'test',
      isTest: true,
      status: 'queued',
      stepCount: 1,
      canCancel: true,
      canRetry: false,
      pendingApprovalIds: [],
    })
    expect(run.startedBy?.id).toBe(setup.builders.bella.id)

    const steps = expectData(
      await bella('GET', `/runs/${run.id}/steps`),
      200,
      agentRunStepsDtoSchema,
    )
    expect(steps.stepsExpired).toBe(false)
    expect(steps.items.map((step) => [step.seq, step.type, step.status])).toEqual([
      [1, 'model', 'skipped'],
    ])
    const first = expectData(
      await bella('GET', `/runs/${run.id}/steps/1`),
      200,
      agentRunStepDetailDtoSchema,
    )
    expect(first.input).toMatchObject({ kind: 'model', run: { messages: MESSAGE.messages } })
    expectError(
      await bella('GET', `/runs/${run.id}/steps/9`),
      404,
      AGENT_RUNS_ERROR_CODES.AGENT_RUN_STEP_NOT_FOUND,
    )
  })

  it('is for people who can edit the agent', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const as = await callers(setup)
    // a User may not test; another Builder cannot see Bella's draft
    expectError(
      await as.uma('POST', `/agents/${agent.id}/test-runs`, MESSAGE),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await as.ben('POST', `/agents/${agent.id}/test-runs`, MESSAGE),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
  })
})

describe('run history', () => {
  it('lists test runs only when asked, and an agent’s runs on its own tab', async () => {
    const setup = await setupAgents()
    const { agent, run, bella } = await withTestRun(setup)

    expect(expectPage(await bella('GET', '/runs'), agentRunDtoSchema).data).toEqual([])
    const tests = expectPage(
      await bella('GET', '/runs', undefined, { isTest: 'true' }),
      agentRunDtoSchema,
    )
    expect(tests.data.map((item) => item.id)).toEqual([run.id])
    const ofAgent = expectPage(
      await bella('GET', `/agents/${agent.id}/runs`, undefined, { isTest: 'true' }),
      agentRunDtoSchema,
    )
    expect(ofAgent.data.map((item) => item.id)).toEqual([run.id])
    const queued = expectPage(
      await bella('GET', '/runs', undefined, { isTest: 'true', status: 'succeeded' }),
      agentRunDtoSchema,
    )
    expect(queued.data).toEqual([])
    const found = expectPage(
      await bella('GET', '/runs', undefined, { isTest: 'true', q: agent.name.slice(0, 4) }),
      agentRunDtoSchema,
    )
    expect(found.data).toHaveLength(1)
  })

  it('shows a run to the people who can edit its agent and to nobody else', async () => {
    const setup = await setupAgents()
    const { run, as } = await withTestRun(setup)

    // an Admin manages every agent; Ben, another Builder, sees nothing of Bella's draft
    expectData(await as.adam('GET', `/runs/${run.id}`), 200, agentRunDetailDtoSchema)
    expectError(
      await as.ben('GET', `/runs/${run.id}`),
      404,
      AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_FOUND,
    )
    expect(
      expectPage(await as.ben('GET', '/runs', undefined, { isTest: 'true' }), agentRunDtoSchema)
        .data,
    ).toEqual([])
    // the other organization's Admin does not even reach the organization
    expectError(
      await request(setup.app, 'GET', runsUrl(setup, `/runs/${run.id}`), {
        headers: setup.sessionOf(setup.b.members.bea),
      }),
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    )
  })
})

describe('canceling and retrying', () => {
  it('cancels an open run, then retries it as a new run with the same input', async () => {
    const setup = await setupAgents()
    const { run, bella, as } = await withTestRun(setup)

    expectError(
      await as.ben('POST', `/runs/${run.id}/cancel`),
      404,
      AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_FOUND,
    )
    expectError(
      await bella('POST', `/runs/${run.id}/retry`, {}),
      409,
      AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_RETRYABLE,
    )

    const canceled = expectData(
      await bella('POST', `/runs/${run.id}/cancel`),
      200,
      agentRunDetailDtoSchema,
    )
    expect(canceled).toMatchObject({ status: 'canceled', canCancel: false, canRetry: true })

    const retried = expectData(
      await bella('POST', `/runs/${run.id}/retry`, {}),
      201,
      agentRunDetailDtoSchema,
    )
    expect(retried).toMatchObject({ status: 'queued', retryOf: { runId: run.id, seq: null } })
    expect(retried.id).not.toBe(run.id)
  })
})
