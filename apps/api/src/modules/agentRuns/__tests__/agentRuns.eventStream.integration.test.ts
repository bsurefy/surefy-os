// SPDX-License-Identifier: AGPL-3.0-only
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { RedisRunEvents, runEventsKey } from '../agentRuns.events.js'
import { RunEventStream } from '../agentRuns.eventStream.js'
import { setupRuns, type RunsSetup } from './agentRunsTestKit.js'

import type { RunRow } from '../agentRuns.types.js'

interface Frame {
  id: string | null
  data: string
}

const decoder = new TextDecoder()

/** The SSE frames of a stream until it ends or `stopWhen` says so; keep-alives are kept as `: keep-alive`. */
async function collect(
  stream: ReadableStream<Uint8Array>,
  stopWhen: (frames: Frame[]) => boolean = () => false,
): Promise<Frame[]> {
  const frames: Frame[] = []
  const reader = stream.getReader()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let end = buffer.indexOf('\n\n')
    while (end >= 0) {
      const raw = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const idLine = raw.split('\n').find((line) => line.startsWith('id: '))
      const dataLine = raw.split('\n').find((line) => line.startsWith('data: '))
      frames.push({
        id: idLine === undefined ? null : idLine.slice(4),
        data: dataLine === undefined ? raw : dataLine.slice(6),
      })
      end = buffer.indexOf('\n\n')
    }
    if (stopWhen(frames)) {
      await reader.cancel()
      break
    }
  }
  return frames
}

const typesOf = (frames: readonly Frame[]): string[] =>
  frames
    .filter((frame) => frame.data.startsWith('{'))
    .map((frame) => (JSON.parse(frame.data) as { type: string }).type)

function streamOf(setup: RunsSetup, timings: { keepAliveMs?: number; waitingMs?: number } = {}) {
  const { container } = setup
  const events = new RedisRunEvents(container.cache, container.logger)
  const stream = new RunEventStream({
    cache: container.cache,
    logger: container.logger,
    keepAliveMs: 100,
    waitingMs: 400,
    ...timings,
  })
  const open = (run: RunRow, after?: string) =>
    stream.open({
      orgId: setup.a.id,
      run,
      ...(after === undefined ? {} : { after }),
      source: {
        current: async (runId) => (await setup.read(runId)).run,
        steps: async (row) => (await setup.read(row.id)).steps,
      },
    })
  return { events, open }
}

const idsOf = async (setup: RunsSetup, runId: string): Promise<string[]> => {
  const entries = await setup.container.cache.client.xrange(
    runEventsKey(setup.a.id, runId),
    '-',
    '+',
  )
  return entries.map(([id]) => id)
}

describe('the run event stream', () => {
  it('follows the live events with their ids and ends after the last one', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    const { events, open } = streamOf(setup)
    await events.publish(setup.a.id, run.id, { type: 'start', messageId: run.id })

    const reading = collect(open(run))
    await new Promise((resolve) => setTimeout(resolve, 50))
    await events.publish(setup.a.id, run.id, { type: 'text-delta', id: 't1', delta: 'Hello' })
    await events.publish(setup.a.id, run.id, {
      type: 'data-run',
      data: { runId: run.id, status: 'succeeded', errorCode: null },
    })
    await events.publish(setup.a.id, run.id, { type: 'finish' })

    const frames = await reading
    expect(typesOf(frames)).toEqual(['start', 'text-delta', 'data-run', 'finish'])
    expect(frames.slice(0, 4).every((frame) => frame.id !== null)).toBe(true)
    expect(frames.at(-1)?.data).toBe('[DONE]')
    expect(frames.slice(0, 4).map((frame) => frame.id)).toEqual(await idsOf(setup, run.id))
  })

  it('resumes after the last event the client saw, without repeating any', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    const { events, open } = streamOf(setup)
    for (const chunk of [
      { type: 'start', messageId: run.id },
      { type: 'text-delta', id: 't1', delta: 'Hel' },
      { type: 'text-delta', id: 't1', delta: 'lo' },
      { type: 'finish' },
    ]) {
      await events.publish(setup.a.id, run.id, chunk)
    }
    const ids = await idsOf(setup, run.id)

    const frames = await collect(open(run, ids[1]))
    expect(typesOf(frames)).toEqual(['text-delta', 'finish'])
    expect(frames[0]?.id).toBe(ids[2])
  })

  it('rebuilds the events from the stored steps when Redis holds none', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    await setup.runs.service.cancel(setup.ctx('olivia'), run.id)
    await setup.container.cache.client.del(runEventsKey(setup.a.id, run.id))
    const { open } = streamOf(setup)

    const frames = await collect(open((await setup.read(run.id)).run))
    expect(typesOf(frames)).toEqual(['start', 'data-step', 'data-run', 'finish'])
    // rebuilt events carry no Redis id
    expect(frames.slice(0, 4).every((frame) => frame.id === null)).toBe(true)
    expect(JSON.parse(frames[1]?.data ?? '{}')).toMatchObject({ data: { seq: 1, type: 'model' } })
  })

  it('rebuilds the final text of a run that succeeded', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    setup.gateway.scripts.push({ text: 'Order 1182 left the warehouse.' })
    await setup.execute(run.id)
    await setup.container.cache.client.del(runEventsKey(setup.a.id, run.id))
    const { open } = streamOf(setup)

    const frames = await collect(open((await setup.read(run.id)).run))
    const types = typesOf(frames)
    expect(types.slice(0, 1)).toEqual(['start'])
    expect(types).toContain('text-delta')
    expect(types.slice(-2)).toEqual(['data-run', 'finish'])
    const text = frames
      .filter((frame) => frame.data.includes('"text-delta"'))
      .map((frame) => (JSON.parse(frame.data) as { delta: string }).delta)
    expect(text).toEqual(['Order 1182 left the warehouse.'])
  })

  it('says it is still there with a comment line, and stops reading when the client leaves', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    await setup.ownerSql(sql`update agent_runs set status = 'running' where id = ${run.id}`)
    const { events, open } = streamOf(setup, { keepAliveMs: 50 })
    await events.publish(setup.a.id, run.id, { type: 'start', messageId: run.id })

    const frames = await collect(open((await setup.read(run.id)).run), (seen) =>
      seen.some((frame) => frame.data === ': keep-alive'),
    )
    expect(frames.some((frame) => frame.data === ': keep-alive')).toBe(true)
    // the run is untouched by the client leaving
    expect((await setup.read(run.id)).run.status).toBe('running')
  })

  it('ends the stream of a run that waits for an approval, after a final status', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    await setup.ownerSql(
      sql`update agent_runs set status = 'waiting_approval' where id = ${run.id}`,
    )
    const { open } = streamOf(setup, { keepAliveMs: 100, waitingMs: 250 })

    const frames = await collect(open((await setup.read(run.id)).run))
    const types = typesOf(frames)
    expect(types.at(-1)).toBe('data-run')
    expect(types).not.toContain('finish')
    expect(
      JSON.parse(frames.filter((frame) => frame.data.startsWith('{')).at(-1)?.data ?? '{}'),
    ).toMatchObject({
      data: { status: 'waiting_approval' },
    })
    expect(frames.at(-1)?.data).toBe('[DONE]')
  })

  it('notices that a run ended when Redis lost the final events', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    const run = await setup.startTest(id)
    await setup.ownerSql(sql`update agent_runs set status = 'running' where id = ${run.id}`)
    const { events, open } = streamOf(setup, { keepAliveMs: 50 })
    await events.publish(setup.a.id, run.id, { type: 'start', messageId: run.id })

    const reading = collect(open((await setup.read(run.id)).run))
    await new Promise((resolve) => setTimeout(resolve, 60))
    await setup.ownerSql(
      sql`update agent_runs set status = 'failed', error_code = 'AGENT_RUN_TURN_LIMIT', finished_at = now() where id = ${run.id}`,
    )

    const types = typesOf(await reading)
    expect(types.slice(0, 1)).toEqual(['start'])
    expect(types.slice(-3)).toEqual(['data-run', 'error', 'finish'])
  })
})
