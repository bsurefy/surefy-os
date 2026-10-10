// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { GUARD_ERROR_CODES } from '@surefy/contracts'

import { apiToolDefinition, refundTool, setupRuns, stepsOfType } from './agentRunsTestKit.js'

const LOCAL_MODEL = 'local/0198f3a0-0000-7000-8000-0000000000f1/llama3'

describe('the personal-data filter on an agent run', () => {
  it('masks the conversation and the instructions before a cloud model reads them', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ instructions: 'Write to ana@example.com first.' })
    setup.gateway.scripts.push({ text: 'Done.' })
    const queued = await setup.startTest(id, 'Refund ben@example.com please')

    await setup.execute(queued.id)

    const sent = setup.gateway.streamed[0]
    expect(sent?.request.instructions).toBe('Write to [EMAIL] first.')
    expect(sent?.request.messages).toEqual([{ role: 'user', content: 'Refund [EMAIL] please' }])
    expect(sent?.ctx.meter).toMatchObject({ piiMasked: true })
    expect(setup.pii.calls[0]).toMatchObject({ method: 'mask', input: { orgId: setup.a.id } })
    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    // the step records where the data went, not a second copy of what was hidden
    const [, model] = steps
    expect(model).toMatchObject({ dataLocation: 'provider' })
    expect(JSON.stringify(model)).not.toContain('ben@example.com')
  })

  it('does not mark a request the filter left alone', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push({ text: 'Done.' })
    const queued = await setup.startTest(id, 'Where is order 1182?')
    await setup.execute(queued.id)
    expect(setup.gateway.streamed[0]?.ctx.meter).toMatchObject({ piiMasked: false })
    expect(setup.gateway.streamed[0]?.request.messages).toEqual([
      { role: 'user', content: 'Where is order 1182?' },
    ])
  })

  it('masks what a tool returned before the next model call', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [refundTool('read_only')]
    setup.tools.outcomes.push({
      ok: true,
      content: 'Owner: cy@example.com',
      data: null,
      truncated: false,
      latencyMs: 5,
      target: 'GET https://api.test/orders/1182',
      attempts: 1,
    })
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'refund_api', input: { orderId: '1182' } }] },
      { text: 'Done.' },
    )
    const queued = await setup.startTest(id)

    await setup.execute(queued.id)

    const second = JSON.stringify(setup.gateway.streamed[1]?.request.messages)
    expect(second).toContain('Owner: [EMAIL]')
    expect(second).not.toContain('cy@example.com')
    expect(setup.gateway.streamed[1]?.ctx.meter).toMatchObject({ piiMasked: true })
  })

  it('stops the run before anything is sent when a blocked type is found', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent()
    setup.gateway.scripts.push({ text: 'never sent' })
    const queued = await setup.startTest(id, 'Refund to card 4111-1111-1111-1111')

    await setup.execute(queued.id)

    expect(setup.gateway.streamed).toHaveLength(0)
    const { run, steps } = await setup.read(queued.id)
    expect(run).toMatchObject({ status: 'failed', errorCode: GUARD_ERROR_CODES.GUARD_PII_BLOCKED })
    const [turn] = stepsOfType(steps, 'model').filter((step) => step.status === 'failed')
    expect(turn).toMatchObject({ errorCode: GUARD_ERROR_CODES.GUARD_PII_BLOCKED })
    expect(turn?.dataLocation).toBeNull()
  })

  it('leaves a local model alone: the data stays on the network', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({
      model: {
        modelKey: LOCAL_MODEL,
        doubleCheckModelKey: null,
        creativity: 0.2,
        useVaultFallback: false,
      },
    })
    setup.gateway.scripts.push({ text: 'Done.' })
    const queued = await setup.startTest(id, 'Refund ben@example.com, card 4111-1111-1111-1111')

    await setup.execute(queued.id)

    expect(setup.pii.calls).toHaveLength(0)
    expect(setup.gateway.streamed[0]?.request.messages).toEqual([
      { role: 'user', content: 'Refund ben@example.com, card 4111-1111-1111-1111' },
    ])
    expect(setup.gateway.streamed[0]?.ctx.meter).toMatchObject({ piiMasked: false })
    expect((await setup.read(queued.id)).run.status).toBe('succeeded')
  })

  it('masks the action and the request in the decision that rates a tool call', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [refundTool('can_act')]
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'refund_api', input: { email: 'dee@example.com' } }] },
      { text: 'Done.' },
    )
    const queued = await setup.startTest(id, 'Refund dee@example.com')

    await setup.execute(queued.id)

    const [decision] = setup.gateway.decided
    expect(decision?.input).toContain('[EMAIL]')
    expect(decision?.input).not.toContain('dee@example.com')
    expect(decision?.ctx.meter).toMatchObject({ piiMasked: true })
    const { steps } = await setup.read(queued.id)
    expect(stepsOfType(steps, 'decision')[0]).toMatchObject({ dataLocation: 'provider' })
  })

  it('treats a decision the filter blocked as no decision', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [refundTool('can_act')]
    setup.gateway.scripts.push(
      { calls: [{ id: 'c1', name: 'refund_api', input: { card: '4111-1111-1111-1111' } }] },
      { text: 'Done.' },
    )
    const queued = await setup.startTest(id, 'Refund the order')

    await setup.execute(queued.id)

    expect(setup.gateway.decided).toHaveLength(0)
    const { steps } = await setup.read(queued.id)
    expect(stepsOfType(steps, 'decision')[0]).toMatchObject({
      status: 'failed',
      errorCode: GUARD_ERROR_CODES.GUARD_PII_BLOCKED,
    })
  })
})
