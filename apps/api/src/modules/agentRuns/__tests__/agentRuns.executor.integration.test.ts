// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'

import { auditLogs, outboxEvents } from '@/database/tables/index.js'
import { ModelProviderUnavailableError } from '@/modules/modelGateway/index.js'
import { AGENT_RUNS_ERROR_CODES } from '@surefy/contracts'

import {
  apiToolDefinition,
  failed,
  lookupTool,
  ok,
  refundTool,
  setupRuns,
  stepsOfType,
  type RunsSetup,
} from './agentRunsTestKit.js'

const outboxOf = (setup: RunsSetup, topic: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.organizationId, setup.a.id), eq(outboxEvents.topic, topic))),
  )

const BASE_ID = '0198f3a0-0000-7000-8000-0000000000c1'

describe('executing a run', () => {
  it('answers without tools: input step, model step, succeeded', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push({ text: 'Your order 1182 was shipped.' })
    const queued = await setup.startTest(id)
    expect(queued).toMatchObject({
      status: 'queued',
      trigger: 'test',
      isTest: true,
      agentVersionId: null,
    })
    expect(setup.enqueued).toEqual([
      { payload: { orgId: setup.a.id, runId: queued.id }, jobId: `agent-run-${queued.id}` },
    ])

    await setup.execute(queued.id)

    const { run, steps } = await setup.read(queued.id)
    expect(run).toMatchObject({
      status: 'succeeded',
      stepCount: 2,
      inputTokens: 100,
      outputTokens: 20,
      costMicros: 1500,
      modelKey: 'openai/gpt-test',
      errorCode: null,
    })
    expect(run.startedAt).not.toBeNull()
    expect(run.finishedAt).not.toBeNull()
    expect(run.summary).toMatchObject({ version: 1, sourcesCount: 0, toolsUsed: [] })
    expect(steps.map((step) => [step.seq, step.type, step.status])).toEqual([
      [1, 'model', 'skipped'],
      [2, 'model', 'succeeded'],
    ])
    expect(steps[1]?.output).toMatchObject({ kind: 'model', text: 'Your order 1182 was shipped.' })
    expect(steps[1]).toMatchObject({ dataLocation: 'provider', modelKey: 'openai/gpt-test' })
    const types = setup.events.types(queued.id)
    expect(types).toContain('text-delta')
    expect(types.at(-1)).toBe('finish')
    expect(types.filter((type) => type === 'data-step')).toHaveLength(1)
    expect(await outboxOf(setup, 'agent_run.finished')).toHaveLength(1)
  })

  it('records the run input and the draft snapshot in the first step', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ instructions: 'Be brief.' })
    const queued = await setup.startTest(id, 'Hello there')
    const { steps } = await setup.read(queued.id)
    expect(steps[0]?.input).toMatchObject({
      kind: 'model',
      run: {
        messages: [{ role: 'user', text: 'Hello there' }],
        definitionSnapshot: { instructions: 'Be brief.' },
        retryOf: null,
      },
    })
  })

  it('runs a read-only tool through Guard, feeds the result back and answers', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [lookupTool()]
    setup.tools.outcomes.push(ok('{"status":"paid"}'))
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'lookup_api', input: { orderId: '1182' } }] },
      { text: 'The order is paid.' },
    )
    const queued = await setup.startTest(id)

    await setup.execute(queued.id)

    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    expect(steps.map((step) => step.type)).toEqual(['model', 'model', 'guard', 'tool', 'model'])
    expect(setup.tools.executed).toEqual([{ tool: 'lookup_api', args: { orderId: '1182' } }])
    // a read-only tool is never judged: no decision step, no model call for one
    expect(setup.gateway.decided).toHaveLength(0)
    expect(steps[2]).toMatchObject({ guardBand: 'auto', status: 'succeeded' })
    // the second model call saw the call and its result
    const second = setup.gateway.streamed[1]?.request.messages ?? []
    expect(second.map((message) => message.role)).toEqual(['user', 'assistant', 'tool'])
    expect(JSON.stringify(second[2])).toContain(String.raw`{\"status\":\"paid\"}`)
    expect(run.summary).toMatchObject({ toolsUsed: ['Lookup API'], guardChecks: { auto: 1 } })
  })

  it('meters each model call under its own key', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [lookupTool()]
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'lookup_api', input: {} }] },
      { text: 'Done' },
    )
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)
    const keys = setup.gateway.streamed.map((entry) => entry.ctx.meter?.key)
    expect(keys).toEqual([`agent_run:${queued.id}:2`, `agent_run:${queued.id}:5`])
    expect(setup.gateway.streamed[0]?.ctx).toMatchObject({
      caller: 'agent',
      allowedModelIds: 'all',
    })
  })

  it('tells the model a tool that does not exist is not there, and goes on', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'made_up', input: {} }] },
      { text: 'Sorry.' },
    )
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)
    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    const [tool] = stepsOfType(steps, 'tool')
    expect(tool).toMatchObject({
      status: 'failed',
      errorCode: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
    })
    expect(setup.tools.executed).toHaveLength(0)
  })

  it('returns a failing tool to the model as an error and the run goes on', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [lookupTool()]
    setup.tools.outcomes.push(failed('The order service timed out', 'AGENT_TOOL_TIMEOUT'))
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'lookup_api', input: {} }] },
      { text: 'I could not reach the order service.' },
    )
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)
    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    expect(stepsOfType(steps, 'tool')[0]).toMatchObject({
      status: 'failed',
      errorCode: 'AGENT_TOOL_TIMEOUT',
    })
    expect(JSON.stringify(setup.gateway.streamed[1]?.request.messages)).toContain('timed out')
  })

  it('fails the run with the gateway’s code when the model is down, keeping a failed model step', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push({ error: new ModelProviderUnavailableError(null) })
    const warn = vi.spyOn(setup.container.logger, 'warn')
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)
    const { run, steps } = await setup.read(queued.id)
    expect(run).toMatchObject({ status: 'failed', errorCode: 'MODEL_PROVIDER_UNAVAILABLE' })
    // the run keeps the code only: the log says why
    const logged = warn.mock.calls.find((call) => call[1] === 'agent run failed')?.[0]
    expect(logged).toMatchObject({ runId: queued.id, errorCode: 'MODEL_PROVIDER_UNAVAILABLE' })
    expect((logged as { err: Error }).err.cause).toBeInstanceOf(ModelProviderUnavailableError)
    expect(steps.at(-1)).toMatchObject({
      type: 'model',
      status: 'failed',
      errorCode: 'MODEL_PROVIDER_UNAVAILABLE',
    })
    expect(setup.events.types(queued.id)).toContain('error')
  })

  it('searches knowledge as the starter and cites what it found', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({
      knowledge: { knowledgeBaseIds: [BASE_ID], citeSources: true, onlyFromKnowledge: false },
    })
    setup.knowledge.result = {
      passages: [
        {
          chunkId: 'k1',
          documentId: '0198f3a0-0000-7000-8000-0000000000d1',
          sourceId: 's1',
          knowledgeBaseId: BASE_ID,
          content: 'Refunds are paid within 5 days.',
          pageFrom: 2,
          pageTo: 2,
          headingPath: [],
          tokenCount: 8,
          rrfScore: 0.5,
          similarity: 0.8,
          documentTitle: 'Refund policy',
          sourceName: 'Handbook',
          relevance: 0.82,
          isUsed: true,
        },
      ],
      skippedLocalOnly: [],
      notSearchedSourceCount: 0,
    }
    setup.gateway.scripts.push({ text: 'Refunds take 5 days [1].' })
    const queued = await setup.startTest(id, 'How long do refunds take?')
    await setup.execute(queued.id)

    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    expect(setup.knowledge.requests[0]).toMatchObject({
      question: 'How long do refunds take?',
      baseIds: [BASE_ID],
      who: { userId: setup.a.members.olivia.id, role: 'owner' },
    })
    const [retrieval] = stepsOfType(steps, 'retrieval')
    expect(retrieval?.output).toMatchObject({
      kind: 'retrieval',
      passages: [{ title: 'Refund policy', page: 2, score: 0.82 }],
    })
    expect(run.summary?.sourcesCount).toBe(1)
    expect(setup.gateway.streamed[0]?.request.instructions).toContain('[1] Refund policy, page 2')
    expect(setup.events.types(queued.id)).toContain('source-url')
  })

  it('answers without sources when the search fails', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({
      knowledge: { knowledgeBaseIds: [BASE_ID], citeSources: true, onlyFromKnowledge: false },
    })
    setup.knowledge.failWith = new Error('embedding service down')
    setup.gateway.scripts.push({ text: 'I do not have sources.' })
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)
    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    expect(stepsOfType(steps, 'retrieval')[0]).toMatchObject({ status: 'failed' })
  })

  it('ends a run that keeps calling tools at the turn limit', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [lookupTool()]
    for (let index = 0; index < 30; index += 1) {
      setup.gateway.scripts.push({ calls: [{ id: `c${index}`, name: 'lookup_api', input: {} }] })
    }
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)
    const { run } = await setup.read(queued.id)
    expect(run).toMatchObject({
      status: 'failed',
      errorCode: AGENT_RUNS_ERROR_CODES.AGENT_RUN_TURN_LIMIT,
    })
    expect(setup.gateway.streamed).toHaveLength(25)
  })

  it('leaves a run that another executor holds alone, and takes over a stale one', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.gateway.scripts.push({ text: 'First' }, { text: 'Second' })
    const queued = await setup.startTest(id)
    // running with a fresh heartbeat: someone owns it
    await setup.ownerSql(
      sql`update agent_runs set status = 'running', started_at = now() where id = ${queued.id}`,
    )
    await setup.execute(queued.id)
    expect((await setup.read(queued.id)).run.status).toBe('running')
    expect(setup.gateway.streamed).toHaveLength(0)

    await setup.ownerSql(
      sql`update agent_runs set updated_at = now() - interval '2 minutes' where id = ${queued.id}`,
    )
    await setup.execute(queued.id)
    expect((await setup.read(queued.id)).run.status).toBe('succeeded')
    expect(setup.gateway.streamed).toHaveLength(1)
  })

  it('continues after a crash without repeating finished steps', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [lookupTool()]
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'lookup_api', input: {} }] },
      { error: new Error('connection reset') }, // an infrastructure error on the second turn
      { text: 'Recovered.' },
    )
    const queued = await setup.startTest(id)
    await expect(setup.execute(queued.id)).rejects.toThrow('connection reset')
    expect((await setup.read(queued.id)).run.status).toBe('running')

    await setup.ownerSql(
      sql`update agent_runs set updated_at = now() - interval '2 minutes' where id = ${queued.id}`,
    )
    await setup.execute(queued.id)

    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    expect(steps.map((step) => step.seq)).toEqual([1, 2, 3, 4, 5])
    expect(setup.tools.executed).toHaveLength(1) // the tool did not run twice
  })

  it('ends the run on the last attempt of an infrastructure error', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push({ error: new Error('connection reset') })
    const queued = await setup.startTest(id)
    await setup.execute(queued.id, { final: true })
    expect((await setup.read(queued.id)).run).toMatchObject({
      status: 'failed',
      errorCode: 'INTERNAL_ERROR',
    })
  })

  it('judges and audits a can_act tool, and audits nothing for a read', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [refundTool('can_act'), lookupTool()]
    setup.gateway.decisions.push({ value: true, confidence: 0.99 })
    setup.gateway.scripts.push(
      {
        calls: [
          { id: 'c1', name: 'refund_api', input: { amount: 12 } },
          { id: 'c2', name: 'lookup_api', input: {} },
        ],
      },
      { text: 'Refunded.' },
    )
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)
    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    expect(stepsOfType(steps, 'decision')).toHaveLength(1)
    expect(run.minConfidence).toBeCloseTo(0.99)
    const entries = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, setup.a.id),
            eq(auditLogs.action, 'agent_run.action_executed'),
          ),
        ),
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      targetType: 'agent_run',
      targetId: queued.id,
      actorType: 'agent',
    })
  })
})
