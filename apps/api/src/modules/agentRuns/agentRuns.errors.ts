// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { AGENTS_ERROR_CODES, AGENT_RUNS_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'
import type { LimitReachedDetail } from '@surefy/contracts'

/** Also for runs of agents the person may not see. */
export class AgentRunNotFoundError extends NotFoundError {
  constructor() {
    super(AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_FOUND, 'Run not found')
  }
}

/** The run is still going, or "from the failed step" has no failed tool step to start from. */
export class AgentRunNotRetryableError extends ConflictError {
  constructor(reason: 'active' | 'succeeded' | 'no_failed_step' | 'not_a_test' | 'expired') {
    super(AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_RETRYABLE, 'This run cannot be retried', {
      details: [{ reason }],
    })
  }
}

/** Not found, deleted, or not usable by the caller. */
export class AgentRunAgentNotFoundError extends NotFoundError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_NOT_FOUND, 'Agent not found')
  }
}

export class AgentRunAgentPausedError extends ConflictError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_PAUSED, 'This agent is paused')
  }
}

export class AgentRunAgentNotPublishedError extends ConflictError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_NOT_PUBLISHED, 'This agent has not been published yet')
  }
}

export class AgentRunAgentNotEditableError extends ConflictError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_NOT_EDITABLE, 'This agent is archived and cannot be tested')
  }
}

/** The plan or license allows no more runs this month (`maxRunsPerMonth`). */
export class AgentRunLimitReachedError extends ForbiddenError {
  constructor(detail: LimitReachedDetail) {
    super(ERROR_CODES.LIMIT_REACHED, 'Run limit reached', { details: [detail] })
  }
}

/** The person may see the run but not steer it. */
export class AgentRunForbiddenError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'You cannot change this run')
  }
}

export class AgentRunInvalidInputError extends UnprocessableError {
  constructor(field: string) {
    super(ERROR_CODES.VALIDATION_FAILED, 'The run input is not valid', { details: [{ field }] })
  }
}

/**
 * Another executor advanced the run, or the run left `running` (a cancel, a timeout): the
 * executor stops quietly and the new state stands. Never reaches a client.
 */
export class AgentRunSupersededError extends Error {
  constructor() {
    super('agent run superseded')
    this.name = 'AgentRunSupersededError'
  }
}

/**
 * The run cannot go on and ends `failed` with this API error code (a model that is down, a
 * budget that ran out, a turn limit). Internal: the executor turns it into the run's status.
 */
export class RunFailure extends Error {
  constructor(readonly code: string) {
    super(`agent run failed: ${code}`)
    this.name = 'RunFailure'
  }
}
