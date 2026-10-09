// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { agents, agentVersions, auditLogs } from '@/database/tables/index.js'
import { AGENT_RUN_MAX_SECONDS, AGENT_RUNS_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'

import {
  apiToolDefinition,
  failed,
  lookupTool,
  only,
  setupRuns,
  stepsOfType,
  type RunsSetup,
} from './agentRunsTestKit.js'
import { AgentRunNotFoundError } from '../agentRuns.errors.js'

const auditOf = (setup: RunsSetup, action: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, action))),
  )

describe('starting a run', () => {
  it('runs the live version for a live trigger, whatever is published afterwards', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ instructions: 'Version one.' })
    const run = await setup.runs.service.start(setup.ctx('olivia'), {
      agentId: id,
      trigger: 'api',
      input: { messages: [{ role: 'user', text: 'Hi' }] },
    })
    expect(run).toMatchObject({ trigger: 'api', isTest: false, startedByUserId: null })
    expect(run.agentVersionId).not.toBeNull()
    // a publish after the start: a second version goes live
    await setup.db.tenant(setup.a.id, async (tx) => {
      const [first] = await tx.select().from(agentVersions).where(eq(agentVersions.version, 1))
      const [second] = await tx
        .insert(agentVersions)
        .values({
          organizationId: setup.a.id,
          agentId: id,
          version: 2,
          definition: { ...only([first]).definition, instructions: 'Version two.' },
        })
        .returning({ id: agentVersions.id })
      await tx
        .update(agents)
        .set({ liveVersionId: only([second]).id })
        .where(eq(agents.id, id))
    })
    setup.gateway.scripts.push({ text: 'Hello' })
    await setup.execute(run.id)

    expect(setup.gateway.streamed[0]?.request.instructions).toContain('Version one.')
    expect(await auditOf(setup, 'agent_run.started')).toHaveLength(1)
  })

  it('reads the draft for a test, and a later draft save does not change it', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ instructions: 'Draft one.' })
    const run = await setup.startTest(id)
    await setup.db.tenant(setup.a.id, async (tx) => {
      const [agent] = await tx.select().from(agents).where(eq(agents.id, id))
      await tx
        .update(agents)
        .set({ draftDefinition: { ...only([agent]).draftDefinition, instructions: 'Draft two.' } })
        .where(eq(agents.id, id))
    })
    setup.gateway.scripts.push({ text: 'Hello' })
    await setup.execute(run.id)
    expect(setup.gateway.streamed[0]?.request.instructions).toContain('Draft one.')
    expect(await auditOf(setup, 'agent_run.started')).toHaveLength(0) // tests are not audited one by one
  })

  it.each([
    ['paused', 'api', 'AGENT_PAUSED'],
    ['archived', 'api', 'AGENT_PAUSED'],
    ['archived', 'test', 'AGENT_NOT_EDITABLE'],
  ] as const)('refuses a %s agent for a %s run with %s', async (status, trigger, code) => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    await setup.ownerSql(sql`update agents set status = ${status} where id = ${id}`)
    await expect(
      setup.runs.service.start(setup.ctx('olivia'), {
        agentId: id,
        trigger,
        input: { messages: [{ role: 'user', text: 'Hi' }] },
      }),
    ).rejects.toMatchObject({ code })
  })

  it('refuses a live run of an agent that was never published', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    await setup.ownerSql(sql`update agents set live_version_id = null where id = ${id}`)
    await expect(
      setup.runs.service.start(setup.ctx('olivia'), {
        agentId: id,
        trigger: 'api',
        input: { messages: [{ role: 'user', text: 'Hi' }] },
      }),
    ).rejects.toMatchObject({ code: 'AGENT_NOT_PUBLISHED' })
  })

  it('does not find the agent of another organization or one the person may not use', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const stranger = {
      ...setup.ctx('olivia'),
      orgId: setup.b.id,
      userId: setup.b.members.bea.id,
    }
    await expect(
      setup.runs.service.start(stranger, {
        agentId: id,
        trigger: 'test',
        input: { messages: [{ role: 'user', text: 'Hi' }] },
      }),
    ).rejects.toMatchObject({ code: 'AGENT_NOT_FOUND' })
    // Uma owns nothing and has no audience row
    const uma = { ...setup.ctx('uma'), access: { ...setup.ctx('uma').access, permissions: [] } }
    await expect(
      setup.runs.service.start(uma, {
        agentId: id,
        trigger: 'test',
        input: { messages: [{ role: 'user', text: 'Hi' }] },
      }),
    ).rejects.toMatchObject({ code: 'AGENT_NOT_FOUND' })
  })

  it('stops at the monthly run limit, tests included', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const ctx = setup.ctx('olivia', { maxRunsPerMonth: 2 })
    const start = () =>
      setup.runs.service.start(ctx, {
        agentId: id,
        trigger: 'test',
        input: { messages: [{ role: 'user', text: 'Hi' }] },
      })
    await start()
    await start()
    await expect(start()).rejects.toMatchObject({
      code: ERROR_CODES.LIMIT_REACHED,
      options: { details: [{ limit: 'maxRunsPerMonth', max: 2, used: 2 }] },
    })
  })

  it('snapshots the starter’s primary team and enqueues the executor once', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    expect(run.startedByUserId).toBe(setup.a.members.olivia.id)
    expect(setup.enqueued).toHaveLength(1)
  })
})

describe('canceling a run', () => {
  it('cancels a queued run and the executor leaves it alone', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)

    const canceled = await setup.runs.service.cancel(setup.ctx('olivia'), run.id)
    expect(canceled).toMatchObject({ status: 'canceled', errorCode: null })
    expect(canceled.finishedAt).not.toBeNull()
    expect((await auditOf(setup, 'agent_run.canceled'))[0]).toMatchObject({ targetId: run.id })

    await setup.execute(run.id)
    expect(setup.gateway.streamed).toHaveLength(0)
    // canceling again returns the run unchanged and writes nothing
    expect((await setup.runs.service.cancel(setup.ctx('olivia'), run.id)).status).toBe('canceled')
    expect(await auditOf(setup, 'agent_run.canceled')).toHaveLength(1)
  })

  it('stops a run in the middle of a model call, at most the step in flight completes', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push({ hold: true })
    const run = await setup.startTest(id)

    const executing = setup.execute(run.id)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect((await setup.read(run.id)).run.status).toBe('running')
    await setup.runs.service.cancel(setup.ctx('olivia'), run.id)
    await executing // the heartbeat noticed and the held call was aborted

    const { run: after, steps } = await setup.read(run.id)
    expect(after.status).toBe('canceled')
    expect(steps.map((step) => step.seq)).toEqual([1]) // no step started after the cancel
    expect(setup.events.types(run.id).at(-1)).toBe('finish')
  })

  it('stores the result of the step in flight but starts no further step', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [lookupTool()]
    setup.tools.onExecute = async () => {
      await setup.runs.service.cancel(setup.ctx('olivia'), run.id)
    }
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'lookup_api', input: {} }] },
      { text: 'never asked' },
    )
    const run = await setup.startTest(id)
    await setup.execute(run.id)

    const { run: after, steps } = await setup.read(run.id)
    expect(after.status).toBe('canceled')
    expect(stepsOfType(steps, 'tool')).toHaveLength(0) // the cancel won the race to the persist
    expect(setup.gateway.streamed).toHaveLength(1)
  })

  it('does not cancel a run of another organization', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    const stranger = { ...setup.ctx('olivia'), orgId: setup.b.id, userId: setup.b.members.bea.id }
    await expect(setup.runs.service.cancel(stranger, run.id)).rejects.toBeInstanceOf(
      AgentRunNotFoundError,
    )
    expect((await setup.read(run.id)).run.status).toBe('queued')
  })
})

describe('retrying a run', () => {
  it('starts a new run with the same input and names the original', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push({
      error: new (await import('@/modules/modelGateway/index.js')).ModelProviderUnavailableError(
        null,
      ),
    })
    const first = await setup.startTest(id, 'Where is my order?')
    await setup.execute(first.id)
    expect((await setup.read(first.id)).run.status).toBe('failed')

    const retried = await setup.runs.service.retry(setup.ctx('olivia'), first.id, {
      fromFailedStep: false,
    })
    expect(retried.id).not.toBe(first.id)
    const { steps } = await setup.read(retried.id)
    expect(steps[0]?.input).toMatchObject({
      kind: 'model',
      run: {
        messages: [{ role: 'user', text: 'Where is my order?' }],
        retryOf: { runId: first.id, seq: null },
      },
    })
    expect((await auditOf(setup, 'agent_run.retried'))[0]).toMatchObject({
      targetId: retried.id,
      metadata: { refs: { originalRunId: first.id } },
    })
    // the original is untouched
    expect((await setup.read(first.id)).run.status).toBe('failed')
  })

  it('refuses to retry a run that is still going or that succeeded', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const open = await setup.startTest(id)
    await expect(
      setup.runs.service.retry(setup.ctx('olivia'), open.id, { fromFailedStep: false }),
    ).rejects.toMatchObject({ code: AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_RETRYABLE })
    setup.gateway.scripts.push({ text: 'ok' })
    await setup.execute(open.id)
    const live = await setup.runs.service.start(setup.ctx('olivia'), {
      agentId: id,
      trigger: 'api',
      input: { messages: [{ role: 'user', text: 'Hi' }] },
    })
    setup.gateway.scripts.push({ text: 'ok' })
    await setup.execute(live.id)
    await expect(
      setup.runs.service.retry(setup.ctx('olivia'), live.id, { fromFailedStep: false }),
    ).rejects.toMatchObject({ code: AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_RETRYABLE })
  })

  it('reuses the earlier steps of a test run and runs the failed tool call again', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [lookupTool()]
    setup.tools.outcomes.push(failed('boom'))
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'lookup_api', input: { id: 1 } }] },
      { text: 'First attempt gave up.' },
    )
    const first = await setup.startTest(id)
    await setup.execute(first.id)
    const firstSteps = (await setup.read(first.id)).steps
    const failedTool = only(stepsOfType(firstSteps, 'tool'))
    expect(failedTool.status).toBe('failed')
    // the run itself succeeded (the model answered); a finished test run may be retried
    expect((await setup.read(first.id)).run.status).toBe('succeeded')

    setup.tools.outcomes.push({ ...(await import('./agentRunsTestKit.js')).ok('found') })
    setup.gateway.scripts.push({ text: 'Found it.' })
    const retried = await setup.runs.service.retry(setup.ctx('olivia'), first.id, {
      fromFailedStep: true,
    })
    const before = (await setup.read(retried.id)).steps
    // the input step, then copies of the model and Guard steps as skipped steps without usage
    expect(before.map((step) => [step.type, step.status])).toEqual([
      ['model', 'skipped'],
      ['model', 'skipped'],
      ['guard', 'skipped'],
    ])
    expect(before.every((step) => step.inputTokens === 0 && step.costMicros === 0)).toBe(true)
    expect(before[0]?.input).toMatchObject({
      run: { retryOf: { runId: first.id, seq: failedTool.seq } },
    })

    const executedBefore = setup.tools.executed.length
    const modelCallsBefore = setup.gateway.streamed.length
    await setup.execute(retried.id)

    const { run, steps } = await setup.read(retried.id)
    expect(run.status).toBe('succeeded')
    expect(setup.tools.executed).toHaveLength(executedBefore + 1) // only the failed call ran again
    expect(setup.gateway.streamed).toHaveLength(modelCallsBefore + 1) // one model call: the answer
    expect(stepsOfType(steps, 'tool')[0]).toMatchObject({ status: 'succeeded' })
    expect(JSON.stringify(setup.gateway.streamed.at(-1)?.request.messages)).toContain('found')
  })

  it('needs a failed tool step for "retry step"', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push({ text: 'ok' })
    const run = await setup.startTest(id)
    await setup.execute(run.id)
    await expect(
      setup.runs.service.retry(setup.ctx('olivia'), run.id, { fromFailedStep: true }),
    ).rejects.toMatchObject({ code: AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_RETRYABLE })
  })
})

describe('the sweeper', () => {
  it('enqueues a queued run that nobody picked up, and a running run that went quiet', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const queued = await setup.startTest(id)
    const running = await setup.startTest(id)
    const fresh = await setup.startTest(id)
    await setup.ownerSql(
      sql`update agent_runs set updated_at = now() - interval '3 minutes' where id = ${queued.id}`,
    )
    await setup.ownerSql(
      sql`update agent_runs set status = 'running', started_at = now(), updated_at = now() - interval '11 minutes' where id = ${running.id}`,
    )
    setup.enqueued.length = 0

    const result = await setup.runs.sweeper.run()

    expect(result).toMatchObject({ requeued: 2, timedOut: 0, resumed: 0 })
    const ids = setup.enqueued.map((job) => job.payload.runId)
    expect(ids).toEqual(expect.arrayContaining([queued.id, running.id]))
    expect(ids).not.toContain(fresh.id)
    // enqueued under a minute-bucketed id, so a completed first job cannot hide it
    expect(setup.enqueued[0]?.jobId).toMatch(/-sweep-\d+$/)
  })

  it('ends a run past the duration limit, canceling nothing it should keep', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    await setup.ownerSql(
      sql`update agent_runs set status = 'running',
        started_at = now() - make_interval(secs => ${AGENT_RUN_MAX_SECONDS + 60}),
        updated_at = now()
        where id = ${run.id}`,
    )
    const result = await setup.runs.sweeper.run()
    expect(result.timedOut).toBe(1)
    expect((await setup.read(run.id)).run).toMatchObject({
      status: 'timed_out',
      errorCode: AGENT_RUNS_ERROR_CODES.AGENT_RUN_TIMED_OUT,
    })
  })

  it('lets the executor end a run whose stretch ran out', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    await setup.ownerSql(
      sql`update agent_runs set status = 'running', updated_at = now() - interval '2 minutes',
        started_at = now() - make_interval(secs => ${AGENT_RUN_MAX_SECONDS + 60})
        where id = ${run.id}`,
    )
    await setup.execute(run.id)
    expect((await setup.read(run.id)).run).toMatchObject({
      status: 'timed_out',
      errorCode: AGENT_RUNS_ERROR_CODES.AGENT_RUN_TIMED_OUT,
    })
    expect(setup.gateway.streamed).toHaveLength(0)
  })
})
