// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { AGENTS_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'
import type {
  AgentEditConflictDetails,
  AgentReadinessDto,
  LimitReachedDetail,
} from '@surefy/contracts'

/** Also for agents the person may not see. */
export class AgentNotFoundError extends NotFoundError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_NOT_FOUND, 'Agent not found')
  }
}

export class AgentVersionNotFoundError extends NotFoundError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_VERSION_NOT_FOUND, 'Version not found')
  }
}

/** The draft moved since `baseRevision`: the editor offers "Review changes" and "Keep mine". */
export class AgentEditConflictError extends ConflictError {
  constructor(details: AgentEditConflictDetails) {
    super(AGENTS_ERROR_CODES.AGENT_EDIT_CONFLICT, 'The agent was changed while you were editing', {
      details: [details],
    })
  }
}

/** Archived and deleted agents are read-only. */
export class AgentNotEditableError extends ConflictError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_NOT_EDITABLE, 'This agent is archived and cannot be changed')
  }
}

export class AgentNotReadyError extends UnprocessableError {
  constructor(readiness: AgentReadinessDto) {
    super(AGENTS_ERROR_CODES.AGENT_NOT_READY, 'The agent is not ready to publish', {
      details: [readiness],
    })
  }
}

/** The transition does not exist from the current status. */
export class AgentStateInvalidError extends ConflictError {
  constructor(from: string, action: string) {
    super(AGENTS_ERROR_CODES.AGENT_STATE_INVALID, `An agent that is ${from} cannot be ${action}`, {
      details: [{ status: from, action }],
    })
  }
}

/** Nothing is live yet: rolling back or pausing a never-published agent. */
export class AgentNotPublishedError extends ConflictError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_NOT_PUBLISHED, 'This agent has not been published yet')
  }
}

/** A person or team of the audience may not use the agent's model. */
export class AgentModelNotAllowedForAudienceError extends UnprocessableError {
  constructor(failures: readonly { type: string; id: string | null; name: string }[]) {
    super(
      AGENTS_ERROR_CODES.AGENT_MODEL_NOT_ALLOWED_FOR_AUDIENCE,
      'The agent’s model is not allowed for everyone it is shared with',
      { details: failures.map((failure) => ({ ...failure })) },
    )
  }
}

/** A typed name that does not match, or a missing reason, on a delete that needs them. */
export class AgentDeleteConfirmationError extends UnprocessableError {
  constructor(field: 'confirmName' | 'reason') {
    super(
      ERROR_CODES.VALIDATION_FAILED,
      'Confirm the deletion with the agent’s name and a reason',
      {
        details: [{ field }],
      },
    )
  }
}

/** The plan or license allows no more agents (`maxAgents`). */
export class AgentLimitReachedError extends ForbiddenError {
  constructor(detail: LimitReachedDetail) {
    super(ERROR_CODES.LIMIT_REACHED, 'Agent limit reached', { details: [detail] })
  }
}

/** The person may see the agent but not change it. */
export class AgentEditForbiddenError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'You cannot change this agent')
  }
}
