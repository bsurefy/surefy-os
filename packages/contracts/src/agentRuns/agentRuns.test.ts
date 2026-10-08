// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  AGENT_RUN_ACTIVE_STATUSES,
  AGENT_RUN_AUDIT_ACTIONS,
  AGENT_RUN_DATA_PART_DATA_TYPES,
  AGENT_RUN_MAX_SECONDS,
  AGENT_RUN_STATUSES,
  AGENT_RUN_STEP_DATA_MAX_BYTES,
  AGENT_RUN_TERMINAL_STATUSES,
  AGENT_RUNS_ERROR_CODES,
  AGENT_RUNS_PERMISSIONS,
  agentRunEventsQuerySchema,
  agentRunStepDataSchema,
  agentRunStepParamsSchema,
  agentRunStreamDataSchemas,
  agentRunStreamQuerySchema,
  agentRunSummarySchema,
  ERROR_CODES,
  listAgentRunsQuerySchema,
  publicRunDtoSchema,
  publicRunInputSchema,
  retryAgentRunInputSchema,
  ROLE_PERMISSIONS,
  startTestRunInputSchema,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const at = '2026-10-08T10:00:00Z'

describe('run statuses', () => {
  it('split into open and finished without overlap', () => {
    const all = [...AGENT_RUN_ACTIVE_STATUSES, ...AGENT_RUN_TERMINAL_STATUSES]
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(AGENT_RUN_STATUSES.length)
    expect(AGENT_RUN_STATUSES).toEqual(expect.arrayContaining(all))
  })
})

describe('step data', () => {
  it('reads each kind by its own fields', () => {
    const parse = (data: unknown) => agentRunStepDataSchema.safeParse(data).success
    expect(
      parse({ version: 1, kind: 'tool', arguments: { amount: 340 }, result: { ok: true } }),
    ).toBe(true)
    expect(
      parse({
        version: 1,
        kind: 'decision',
        question: 'Refund?',
        value: 'yes',
        reasoning: 'Policy',
      }),
    ).toBe(true)
    expect(
      parse({
        version: 1,
        kind: 'retrieval',
        query: 'refund policy',
        passages: [
          { documentId: id, title: 'Policy', page: 2, score: 0.8, text: 'Refunds within 30 days' },
        ],
      }),
    ).toBe(true)
    expect(
      parse({
        version: 1,
        kind: 'approval',
        outcome: 'approved_with_edits',
        editedInput: { amount: 200 },
      }),
    ).toBe(true)
    expect(
      parse({ version: 1, kind: 'web_search', provider: 'brave', query: 'x', results: [] }),
    ).toBe(true)
    expect(parse({ version: 2, kind: 'tool' })).toBe(false)
    expect(parse({ version: 1, kind: 'unknown' })).toBe(false)
    expect(agentRunStepDataSchema.parse({ version: 1, kind: 'tool' })).toMatchObject({
      truncated: false,
    })
  })

  it('carries the run input in the first step, with at least one message', () => {
    const run = {
      messages: [{ role: 'user', text: 'Refund order 1182' }],
      channelId: null,
      externalRef: null,
      definitionSnapshot: null,
      retryOf: { runId: id, seq: 4 },
    }
    expect(agentRunStepDataSchema.safeParse({ version: 1, kind: 'model', run }).success).toBe(true)
    expect(
      agentRunStepDataSchema.safeParse({ version: 1, kind: 'model', run: { ...run, messages: [] } })
        .success,
    ).toBe(false)
    expect(AGENT_RUN_STEP_DATA_MAX_BYTES).toBe(65_536)
  })

  it('reads a step number from the path', () => {
    const base = { orgId: id, runId: id }
    expect(agentRunStepParamsSchema.parse({ ...base, seq: '3' }).seq).toBe(3)
    expect(agentRunStepParamsSchema.safeParse({ ...base, seq: '0' }).success).toBe(false)
  })
})

describe('run summary', () => {
  it('counts Guard checks per outcome', () => {
    expect(
      agentRunSummarySchema.safeParse({
        version: 1,
        outcome: 'Refunded order 1182 after approval.',
        toolsUsed: ['Refund API'],
        sourcesCount: 2,
        guardChecks: { auto: 1, human: 1 },
        approvalIds: [id],
        dataLocations: ['provider'],
      }).success,
    ).toBe(true)
    expect(
      agentRunSummarySchema.safeParse({
        version: 1,
        outcome: '',
        toolsUsed: [],
        sourcesCount: 0,
        guardChecks: { maybe: 1 },
        approvalIds: [],
        dataLocations: [],
      }).success,
    ).toBe(false)
  })
})

describe('run queries and inputs', () => {
  it('filters the list with arrays and flags, and sorts by an allowed field', () => {
    expect(listAgentRunsQuerySchema.parse({ status: 'failed' }).status).toEqual(['failed'])
    expect(listAgentRunsQuerySchema.parse({ trigger: ['api', 'slack'] }).trigger).toEqual([
      'api',
      'slack',
    ])
    expect(listAgentRunsQuerySchema.parse({ isTest: 'true', neededHuman: 'false' })).toMatchObject({
      isTest: true,
      neededHuman: false,
    })
    expect(listAgentRunsQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false)
    expect(listAgentRunsQuerySchema.safeParse({ sort: '-costMicros' }).success).toBe(true)
    expect(listAgentRunsQuerySchema.safeParse({ sort: 'status' }).success).toBe(false)
  })

  it('starts a test run from at least one message', () => {
    expect(
      startTestRunInputSchema.safeParse({ messages: [{ role: 'user', text: 'Hi' }] }).success,
    ).toBe(true)
    expect(startTestRunInputSchema.safeParse({ messages: [] }).success).toBe(false)
  })

  it('retries the whole run unless asked for the failed step', () => {
    expect(retryAgentRunInputSchema.parse({})).toEqual({ fromFailedStep: false })
    expect(retryAgentRunInputSchema.parse({ fromFailedStep: true })).toEqual({
      fromFailedStep: true,
    })
  })

  it('reads the stream options', () => {
    expect(agentRunStreamQuerySchema.parse({}).stream).toBe(false)
    expect(agentRunStreamQuerySchema.parse({ stream: 'true' }).stream).toBe(true)
    expect(agentRunEventsQuerySchema.parse({ after: '1696760000000-0' })).toEqual({
      after: '1696760000000-0',
    })
    expect(agentRunEventsQuerySchema.safeParse({ after: '' }).success).toBe(false)
  })
})

describe('public runs', () => {
  it('takes one message or a conversation ending with the user, never both', () => {
    expect(publicRunInputSchema.safeParse({ input: 'Where is my order?' }).success).toBe(true)
    expect(
      publicRunInputSchema.safeParse({
        messages: [
          { role: 'user', text: 'Hi' },
          { role: 'assistant', text: 'Hello' },
          { role: 'user', text: 'Order status?' },
        ],
      }).success,
    ).toBe(true)
    expect(publicRunInputSchema.safeParse({}).success).toBe(false)
    expect(
      publicRunInputSchema.safeParse({ input: 'x', messages: [{ role: 'user', text: 'x' }] })
        .success,
    ).toBe(false)
    expect(
      publicRunInputSchema.safeParse({ messages: [{ role: 'assistant', text: 'x' }] }).success,
    ).toBe(false)
    expect(
      publicRunInputSchema.safeParse({ input: 'x', metadata: { ticket: 'T-1' } }).success,
    ).toBe(true)
    expect(publicRunInputSchema.safeParse({ input: 'x', metadata: { ticket: 1 } }).success).toBe(
      false,
    )
  })

  it('shows a finished run with its answer and a waiting run without one', () => {
    const base = {
      id,
      agentId: id,
      errorCode: null,
      metadata: {},
      inputTokens: 10,
      outputTokens: 20,
      createdAt: at,
      finishedAt: null,
    }
    expect(
      publicRunDtoSchema.safeParse({
        ...base,
        status: 'succeeded',
        output: { text: 'Shipped.', sources: [{ title: 'Orders', documentId: null, page: null }] },
        waitingForApproval: false,
        finishedAt: at,
      }).success,
    ).toBe(true)
    expect(
      publicRunDtoSchema.safeParse({
        ...base,
        status: 'waiting_approval',
        output: null,
        waitingForApproval: true,
      }).success,
    ).toBe(true)
    expect(
      publicRunDtoSchema.safeParse({
        ...base,
        status: 'paused',
        output: null,
        waitingForApproval: false,
      }).success,
    ).toBe(false)
  })
})

describe('event stream parts', () => {
  it('names a schema for every data chunk', () => {
    expect(Object.keys(agentRunStreamDataSchemas)).toEqual(
      Object.keys(AGENT_RUN_DATA_PART_DATA_TYPES),
    )
    for (const type of Object.values(AGENT_RUN_DATA_PART_DATA_TYPES))
      expect(type).toMatch(/^data-[a-z-]+$/)
  })

  it('checks a status change and an approval wait', () => {
    expect(
      agentRunStreamDataSchemas.run.safeParse({
        runId: id,
        status: 'waiting_approval',
        errorCode: null,
      }).success,
    ).toBe(true)
    expect(
      agentRunStreamDataSchemas.run.safeParse({ runId: id, status: 'paused', errorCode: null })
        .success,
    ).toBe(false)
    expect(
      agentRunStreamDataSchemas.approvalRequired.safeParse({
        seq: 4,
        approvalId: id,
        title: 'Refund $340 to order #1182',
        assignees: [{ subjectType: 'role', user: null, team: null, role: 'admin', source: 'rule' }],
        expiresAt: null,
      }).success,
    ).toBe(true)
    expect(
      agentRunStreamDataSchemas.confidence.safeParse({ seq: 3, value: 1.4, question: 'Refund?' })
        .success,
    ).toBe(false)
  })
})

describe('run codes, permissions and audit', () => {
  it('registers every error code', () => {
    for (const code of Object.values(AGENT_RUNS_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
    expect(AGENT_RUN_MAX_SECONDS).toBe(900)
  })

  it('lets Builders read, cancel and retry runs, not plain users', () => {
    for (const permission of Object.values(AGENT_RUNS_PERMISSIONS)) {
      expect(ROLE_PERMISSIONS.user).not.toContain(permission.key)
      expect(ROLE_PERMISSIONS.builder).toContain(permission.key)
    }
  })

  it('names audit actions <area>.<verb>', () => {
    for (const action of Object.values(AGENT_RUN_AUDIT_ACTIONS))
      expect(action).toMatch(/^agent_run\.[a-z_]+$/)
  })
})
