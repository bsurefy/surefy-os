// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { AGENT_TRUST_MIN_RUNS } from '@surefy/contracts'

import { createAgentRunSummaries } from '../agentRuns.summaries.js'
import { setupRuns, type RunsSetup } from './agentRunsTestKit.js'

/** Finished runs of an agent, written directly: the executor is not what these tests are about. */
async function seedRuns(
  setup: RunsSetup,
  agentId: string,
  count: number,
  values: { status: string; humanCorrected?: boolean; isTest?: boolean },
): Promise<void> {
  const trigger = values.isTest === true ? 'test' : 'api'
  await setup.ownerSql(sql`
    insert into agent_runs (organization_id, agent_id, trigger, is_test, status, human_corrected, finished_at)
    select ${setup.a.id}::uuid, ${agentId}::uuid, ${trigger}, ${values.isTest === true}, ${values.status},
           ${values.humanCorrected === true}, now()
    from generate_series(1, ${count})`)
}

const summariesOf = (setup: RunsSetup, agentIds: string[]) =>
  setup.db.tenant(setup.a.id, (tx) => createAgentRunSummaries().summaries(tx, setup.a.id, agentIds))

describe('what the runs say about an agent', () => {
  it('shows the trust score only from enough finished runs, and leaves out tests and cancels', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    await seedRuns(setup, id, AGENT_TRUST_MIN_RUNS - 5, { status: 'succeeded' })
    await seedRuns(setup, id, 3, { status: 'succeeded', isTest: true })
    await seedRuns(setup, id, 4, { status: 'canceled' })

    const few = (await summariesOf(setup, [id])).get(id)
    expect(few?.trust).toEqual({ score: null, runs: AGENT_TRUST_MIN_RUNS - 5 })

    await seedRuns(setup, id, 3, { status: 'succeeded', humanCorrected: true })
    await seedRuns(setup, id, 2, { status: 'failed' })
    const enough = (await summariesOf(setup, [id])).get(id)
    expect(enough?.trust.runs).toBe(AGENT_TRUST_MIN_RUNS)
    expect(enough?.trust.score).toBeCloseTo((AGENT_TRUST_MIN_RUNS - 5) / AGENT_TRUST_MIN_RUNS)
    expect(enough?.runsThisWeek).toBe(AGENT_TRUST_MIN_RUNS + 4)
    expect(enough?.lastRun?.status).toBeDefined()
  })

  it('flags an agent whose last runs all failed', async () => {
    const setup = await setupRuns()
    const failing = await setup.agent()
    const fine = await setup.agent()
    await seedRuns(setup, failing.id, 5, { status: 'failed' })
    await seedRuns(setup, fine.id, 4, { status: 'failed' })
    await seedRuns(setup, fine.id, 1, { status: 'succeeded' })

    const summaries = await summariesOf(setup, [failing.id, fine.id])
    expect(summaries.get(failing.id)?.recentRunsFailed).toBe(true)
    expect(summaries.get(fine.id)?.recentRunsFailed).toBe(false)
  })

  it('counts the runs that are not tests, and finds the last test', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const summaries = createAgentRunSummaries()
    const read = <T>(
      read: (tx: Parameters<Parameters<typeof setup.db.tenant>[1]>[0]) => Promise<T>,
    ) => setup.db.tenant(setup.a.id, read)

    expect(await read((tx) => summaries.lastTestRunAt(tx, setup.a.id, id))).toBeNull()
    await setup.startTest(id)
    await seedRuns(setup, id, 2, { status: 'succeeded' })
    expect(await read((tx) => summaries.countRuns(tx, setup.a.id, id))).toBe(2)
    expect(await read((tx) => summaries.lastTestRunAt(tx, setup.a.id, id))).toBeInstanceOf(Date)
  })
})

describe('the run list', () => {
  it('pages by keyset in the order asked for, whatever the sort', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    for (const cost of [300, 100, 200]) {
      await seedRuns(setup, id, 1, { status: 'succeeded' })
      await setup.ownerSql(
        sql`update agent_runs set cost_micros = ${cost} where id = (select id from agent_runs where cost_micros = 0 and agent_id = ${id}::uuid limit 1)`,
      )
    }
    const { queries } = setup.runs
    const ctx = setup.ctx('olivia')

    const first = await queries.list(ctx, { limit: 2, sort: 'costMicros' })
    expect(first.items.map((run) => run.costMicros)).toEqual([100, 200])
    expect(first.nextCursor).not.toBeNull()
    const second = await queries.list(ctx, {
      limit: 2,
      sort: 'costMicros',
      cursor: first.nextCursor ?? undefined,
    })
    expect(second.items.map((run) => run.costMicros)).toEqual([300])
    expect(second.nextCursor).toBeNull()

    const descending = await queries.list(ctx, { limit: 5, sort: '-costMicros' })
    expect(descending.items.map((run) => run.costMicros)).toEqual([300, 200, 100])
  })
})
