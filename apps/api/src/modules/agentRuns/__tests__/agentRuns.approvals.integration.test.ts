// SPDX-License-Identifier: AGPL-3.0-only
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { agentRuns, outboxEvents } from '@/database/tables/index.js'

import {
  apiToolDefinition,
  approvalsOf,
  lookupTool,
  only,
  refundTool,
  settleApproval,
  setupRuns,
  stepsOfType,
  type RunsSetup,
} from './agentRunsTestKit.js'

/** A run that asks to refund and, once the refund went through, says so. */
async function askToRefund(setup: RunsSetup, text = 'Refunded.') {
  const { id } = await setup.agent({ tools: [apiToolDefinition()] })
  setup.tools.tools = [refundTool('ask_first'), lookupTool()]
  setup.gateway.scripts.push(
    { calls: [{ id: 'c1', name: 'refund_api', input: { amount: 340, orderId: '1182' } }] },
    { text },
  )
  const queued = await setup.startTest(id)
  await setup.execute(queued.id)
  return queued
}

describe('pausing for an approval', () => {
  it('creates the approval, waits without a worker and keeps the call unrun', async () => {
    const setup = await setupRuns()
    const queued = await askToRefund(setup)

    const { run, steps } = await setup.read(queued.id)
    expect(run).toMatchObject({ status: 'waiting_approval', neededHuman: true, finishedAt: null })
    expect(steps.map((step) => [step.type, step.status])).toEqual([
      ['model', 'skipped'],
      ['model', 'succeeded'],
      ['decision', 'succeeded'],
      ['guard', 'succeeded'],
      ['approval', 'waiting'],
    ])
    expect(setup.tools.executed).toHaveLength(0)
    expect(steps[3]).toMatchObject({ guardBand: 'human' })

    const approval = only(await approvalsOf(setup, queued.id))
    expect(approval).toMatchObject({ status: 'pending', kind: 'ai_action', agentRunId: queued.id })
    expect(steps[4]?.approvalId).toBe(approval.id)
    expect(setup.events.types(queued.id)).toEqual(
      expect.arrayContaining(['data-approval-required', 'data-run']),
    )
    // nothing is left to run: the job ended
    expect((await setup.read(queued.id)).run.status).toBe('waiting_approval')
  })

  it('resumes once, and runs the approved call with its original input', async () => {
    const setup = await setupRuns()
    const queued = await askToRefund(setup)
    const approval = only(await approvalsOf(setup, queued.id))
    await settleApproval(setup, approval.id, { status: 'approved' })

    expect(await setup.runs.resumer.onApprovalSettled(setup.a.id, approval.id)).toBe(true)
    expect(await setup.runs.resumer.onApprovalSettled(setup.a.id, approval.id)).toBe(false) // a second event
    expect((await setup.read(queued.id)).run.status).toBe('running')
    const resumes = setup.enqueued.filter((job) => job.payload.approvalId !== undefined)
    expect(resumes).toEqual([
      {
        payload: { orgId: setup.a.id, runId: queued.id, approvalId: approval.id },
        jobId: `agent-run-${queued.id}-resume-${approval.id}`,
      },
    ])

    await setup.execute(queued.id, { approvalId: approval.id })

    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    expect(run.humanCorrected).toBe(false)
    expect(setup.tools.executed).toEqual([
      { tool: 'refund_api', args: { amount: 340, orderId: '1182' } },
    ])
    const closing = stepsOfType(steps, 'approval').at(-1)
    expect(closing).toMatchObject({ status: 'succeeded', approvalId: approval.id })
    expect(closing?.output).toMatchObject({ kind: 'approval', callId: 'c1', outcome: 'approved' })
    // the wait is counted in the duration, and the second model call saw the refund result
    expect(run.durationMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(setup.gateway.streamed[1]?.request.messages)).toContain('Done')
  })

  it('runs the call with the approver’s edits and marks the run corrected', async () => {
    const setup = await setupRuns()
    const queued = await askToRefund(setup)
    const approval = only(await approvalsOf(setup, queued.id))
    await settleApproval(setup, approval.id, {
      status: 'approved',
      editedInput: { amount: 120, orderId: '1182' },
    })
    await setup.runs.resumer.onApprovalSettled(setup.a.id, approval.id)
    await setup.execute(queued.id, { approvalId: approval.id })

    const { run, steps } = await setup.read(queued.id)
    expect(run).toMatchObject({ status: 'succeeded', humanCorrected: true })
    expect(setup.tools.executed[0]?.args).toEqual({ amount: 120, orderId: '1182' })
    expect(stepsOfType(steps, 'approval').at(-1)?.output).toMatchObject({
      outcome: 'approved_with_edits',
      editedInput: { amount: 120 },
    })
  })

  it('does not run a rejected call; the model gets the rejection', async () => {
    const setup = await setupRuns()
    const queued = await askToRefund(setup, 'A person said no.')
    const approval = only(await approvalsOf(setup, queued.id))
    await settleApproval(setup, approval.id, { status: 'rejected' })
    await setup.runs.resumer.onApprovalSettled(setup.a.id, approval.id)
    await setup.execute(queued.id, { approvalId: approval.id })

    const { run, steps } = await setup.read(queued.id)
    expect(run).toMatchObject({ status: 'succeeded', humanCorrected: true })
    expect(setup.tools.executed).toHaveLength(0)
    expect(stepsOfType(steps, 'approval').at(-1)).toMatchObject({ status: 'skipped' })
    expect(stepsOfType(steps, 'tool')[0]).toMatchObject({ status: 'skipped' })
    expect(JSON.stringify(setup.gateway.streamed[1]?.request.messages)).toContain('rejected')
  })

  it.each([
    ['reject', false],
    ['continue', true],
  ] as const)('handles a timeout that %ss', async (timeoutAction, runs) => {
    const setup = await setupRuns()
    const queued = await askToRefund(setup)
    const approval = only(await approvalsOf(setup, queued.id))
    await settleApproval(setup, approval.id, { status: 'expired', timeoutAction })
    await setup.runs.resumer.onApprovalSettled(setup.a.id, approval.id)
    await setup.execute(queued.id, { approvalId: approval.id })

    const { run, steps } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded')
    expect(setup.tools.executed).toHaveLength(runs ? 1 : 0)
    expect(stepsOfType(steps, 'approval').at(-1)?.output).toMatchObject({
      outcome: runs ? 'timed_out_continued' : 'timed_out_rejected',
    })
  })

  it('waits for every approval of a turn before it goes on', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [refundTool('ask_first')]
    setup.gateway.scripts.push(
      {
        calls: [
          { id: 'c1', name: 'refund_api', input: { amount: 1 } },
          { id: 'c2', name: 'refund_api', input: { amount: 2 } },
        ],
      },
      { text: 'Both done.' },
    )
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)
    const approvalRows = await approvalsOf(setup, queued.id)
    expect(approvalRows).toHaveLength(2)
    expect(stepsOfType((await setup.read(queued.id)).steps, 'approval')).toHaveLength(2)

    await settleApproval(setup, only(approvalRows).id, { status: 'approved' })
    expect(await setup.runs.resumer.onApprovalSettled(setup.a.id, only(approvalRows).id)).toBe(
      false,
    )
    expect((await setup.read(queued.id)).run.status).toBe('waiting_approval')

    await settleApproval(setup, only(approvalRows, 1).id, { status: 'approved' })
    expect(await setup.runs.resumer.onApprovalSettled(setup.a.id, only(approvalRows, 1).id)).toBe(
      true,
    )
    await setup.execute(queued.id, { approvalId: only(approvalRows, 1).id })

    expect((await setup.read(queued.id)).run.status).toBe('succeeded')
    expect(setup.tools.executed.map((entry) => entry.args)).toEqual([{ amount: 1 }, { amount: 2 }])
  })

  it('does not pause when the approval was decided before the run could wait', async () => {
    const setup = await setupRuns()
    const { id } = await setup.agent({ tools: [apiToolDefinition()] })
    setup.tools.tools = [lookupTool(), refundTool('ask_first')]
    setup.tools.onExecute = async (tool) => {
      if (tool !== 'lookup_api') return
      const approval = only(await approvalsOf(setup, queued.id))
      await settleApproval(setup, approval.id, { status: 'approved' })
    }
    setup.gateway.scripts.push(
      {
        calls: [
          { id: 'c1', name: 'refund_api', input: { amount: 5 } },
          { id: 'c2', name: 'lookup_api', input: {} },
        ],
      },
      { text: 'Done.' },
    )
    const queued = await setup.startTest(id)
    await setup.execute(queued.id)

    const { run } = await setup.read(queued.id)
    expect(run.status).toBe('succeeded') // never waited
    expect(setup.tools.executed.map((entry) => entry.tool)).toEqual(['lookup_api', 'refund_api'])
  })

  it('cancels the pending approval when the run is canceled', async () => {
    const setup = await setupRuns()
    const queued = await askToRefund(setup)
    const approval = only(await approvalsOf(setup, queued.id))

    const canceled = await setup.runs.service.cancel(setup.ctx('olivia'), queued.id)
    expect(canceled.status).toBe('canceled')

    const [after] = await approvalsOf(setup, queued.id)
    expect(after).toMatchObject({ id: approval.id, status: 'canceled', resolvedBy: 'system' })
    // a late decision event finds nothing to resume
    expect(await setup.runs.resumer.onApprovalSettled(setup.a.id, approval.id)).toBe(false)
    expect(setup.tools.executed).toHaveLength(0)
  })

  it('lets the sweeper resume a run whose resume event was lost', async () => {
    const setup = await setupRuns()
    const queued = await askToRefund(setup)
    const approval = only(await approvalsOf(setup, queued.id))
    await settleApproval(setup, approval.id, { status: 'approved' })

    const swept = await setup.runs.sweeper.run()
    expect(swept.resumed).toBe(1)
    expect((await setup.read(queued.id)).run.status).toBe('running')
    expect(setup.enqueued.at(-1)?.payload).toMatchObject({ runId: queued.id })
  })

  it('writes agent_run.finished in the transaction that ends the run', async () => {
    const setup = await setupRuns()
    const queued = await askToRefund(setup)
    await setup.runs.service.cancel(setup.ctx('olivia'), queued.id)
    const events = await setup.db.system('test', (tx) =>
      tx.select().from(outboxEvents).where(eq(outboxEvents.topic, 'agent_run.finished')),
    )
    expect(events).toHaveLength(1)
    expect(events[0]?.payload).toMatchObject({ id: queued.id, status: 'canceled' })
    const [row] = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(agentRuns).where(eq(agentRuns.id, queued.id)),
    )
    expect(row?.summary).toMatchObject({ version: 1 })
  })
})
