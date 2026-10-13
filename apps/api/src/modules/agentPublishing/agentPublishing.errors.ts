// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { AGENTS_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'

export class ChannelNotFoundError extends NotFoundError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_CHANNEL_NOT_FOUND, 'Channel not found')
  }
}

export class ChannelExistsError extends ConflictError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_CHANNEL_EXISTS, 'This agent already has a channel of this type')
  }
}

export class ChannelPendingApprovalError extends ConflictError {
  constructor() {
    super(
      AGENTS_ERROR_CODES.AGENT_CHANNEL_PENDING_APPROVAL,
      'This channel waits for an approval and cannot change yet',
    )
  }
}

/** A channel move that does not exist from the channel's status (resume an active channel). */
export class ChannelStateInvalidError extends ConflictError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_STATE_INVALID, 'The channel cannot do this from its status')
  }
}

export class ChannelEditForbiddenError extends ForbiddenError {
  constructor() {
    super(ERROR_CODES.ACCESS_FORBIDDEN, 'You cannot change the channels of this agent')
  }
}

/** A channel type, block or field this channel does not take, or an adapter that is not here yet. */
export const channelNotAvailable = (field: string, reason: string) =>
  new UnprocessableError(ERROR_CODES.VALIDATION_FAILED, 'This channel is not available', {
    details: [{ field, reason }],
  })

export class WidgetTokenInvalidError extends UnauthorizedError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_WIDGET_TOKEN_INVALID, 'The widget token is not valid')
  }
}

export class WidgetOriginNotAllowedError extends ForbiddenError {
  constructor() {
    super(
      AGENTS_ERROR_CODES.AGENT_WIDGET_ORIGIN_NOT_ALLOWED,
      'The widget is not allowed on this website',
    )
  }
}

/** `429 RATE_LIMITED`; the controller turns `retryAfterSeconds` into `Retry-After`. */
export class ChannelRateLimitedError extends TooManyRequestsError {
  constructor(
    readonly retryAfterSeconds: number,
    message: string,
    limitPerMinute: number,
  ) {
    super(undefined, message, { details: [{ limitPerMinute }] })
  }
}

export class ChannelAccountInUseError extends ConflictError {
  constructor() {
    super(
      AGENTS_ERROR_CODES.AGENT_CHANNEL_ACCOUNT_IN_USE,
      'This account already answers for another agent',
    )
  }
}

export class ChannelSignatureInvalidError extends UnauthorizedError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_CHANNEL_SIGNATURE_INVALID, 'The event signature is not valid')
  }
}

export class ChannelVerifyTokenInvalidError extends ForbiddenError {
  constructor() {
    super(AGENTS_ERROR_CODES.AGENT_CHANNEL_VERIFY_TOKEN_INVALID, 'The verify token is not valid')
  }
}
