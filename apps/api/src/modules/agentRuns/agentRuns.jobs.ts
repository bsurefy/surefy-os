// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { AGENT_RUN_JOBS } from './agentRuns.constants.js'

import type { AgentRunExecutor } from './agentRuns.executor.js'
import type { AgentRunSweeper } from './agentRuns.sweeper.js'

/** IDs only (job rules): the run's state is in its steps, never in the payload. */
export const executeAgentRunPayload = z.object({
  orgId: z.uuid(),
  runId: z.uuid(),
  /** Set on a resume job: the approval that let the run go on. */
  approvalId: z.uuid().optional(),
})
export type ExecuteAgentRunPayload = z.infer<typeof executeAgentRunPayload>

/**
 * `agent-runs` / `executeAgentRun`: runs the agent loop for one run. The claim makes every
 * attempt safe, so BullMQ's default retries (5, exponential backoff) apply; the last attempt
 * ends the run `failed` instead of leaving it open.
 */
export const createExecuteJob = (executor: AgentRunExecutor) =>
  defineJob({
    queue: QUEUES.AGENT_RUNS,
    name: AGENT_RUN_JOBS.EXECUTE,
    schema: executeAgentRunPayload,
    process: () => async (payload, job) => {
      await executor.execute(payload, { final: job.attemptsMade + 1 >= (job.opts.attempts ?? 1) })
    },
  })

/** `agent-runs` / `sweepAgentRuns` (scheduler `agent-run-sweeper`, every minute). One attempt: the next run retries. */
export const createSweepJob = (sweeper: AgentRunSweeper) =>
  defineJob({
    queue: QUEUES.AGENT_RUNS,
    name: AGENT_RUN_JOBS.SWEEP,
    schema: z.object({}),
    options: { attempts: 1 },
    process: () => async () => {
      await sweeper.run()
    },
  })
