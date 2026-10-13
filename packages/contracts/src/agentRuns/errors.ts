// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the agentRuns domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const AGENT_RUNS_ERROR_CODES = {
  AGENT_RUN_NOT_FOUND: 'AGENT_RUN_NOT_FOUND', // 404: also for runs of agents the person may not see
  AGENT_RUN_NOT_RETRYABLE: 'AGENT_RUN_NOT_RETRYABLE', // 409: still active, or "from the failed step" without a failed tool step in a test run
  AGENT_RUN_TURN_LIMIT: 'AGENT_RUN_TURN_LIMIT', // run error: the model was called AGENT_RUN_MAX_TURNS times without finishing
  AGENT_RUN_TIMED_OUT: 'AGENT_RUN_TIMED_OUT', // run error: one stretch of execution passed AGENT_RUN_MAX_SECONDS
  AGENT_RUN_STEP_NOT_FOUND: 'AGENT_RUN_STEP_NOT_FOUND', // 404: no such step, or its details passed the 90-day retention
  AGENT_TOOL_FAILED: 'AGENT_TOOL_FAILED', // step error: the tool answered with an error
  AGENT_TOOL_TIMEOUT: 'AGENT_TOOL_TIMEOUT', // step error: no answer within AGENT_TOOL_TIMEOUT_MS
} as const
