// SPDX-License-Identifier: AGPL-3.0-only

/** The `agent-runs` queue's jobs (the limits are in `@surefy/contracts`, agentRuns/constants.ts). */
export const AGENT_RUN_JOBS = {
  EXECUTE: 'executeAgentRun',
  SWEEP: 'sweepAgentRuns',
} as const

/** `agent-run-sweeper` runs every minute. */
export const SWEEP_EVERY_MS = 60_000

/** A `queued` run with no executor picking it up for this long is enqueued again. */
export const QUEUED_STALE_MINUTES = 2

/** A `running` run whose heartbeat is younger than this is owned by a live executor. */
export const HEARTBEAT_LIVE_MS = 30_000

/** Runs one sweeper pass handles per kind; the next pass takes the rest. */
export const SWEEP_BATCH = 200

/** The system scope reason of the sweeper. */
export const SWEEP_REASON = 'agent-run-sweeper' as const

/** Passages kept for the answer, and how much of each goes into the prompt and the step. */
export const RETRIEVAL_PASSAGES = 5
export const PASSAGE_PROMPT_CHARS = 2_000

/** Text deltas are published at most this often (20 events a second). */
export const TEXT_FLUSH_MS = 50

/** The audit and summary text for a run that ended without an answer. */
export const OUTCOME_MAX = 500

/** What the model reads for a call that was not run. */
export const BLOCKED_RESULT =
  'This action is not allowed. Explain that to the user or choose another way.'
export const REJECTED_RESULT = 'A person rejected this action, so it was not run.'
export const TOO_MANY_CALLS_RESULT = 'Too many tool calls in one turn; this one was not run.'
export const UNKNOWN_TOOL_RESULT = 'This tool does not exist.'
