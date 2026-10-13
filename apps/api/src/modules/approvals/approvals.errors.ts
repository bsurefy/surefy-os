// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { APPROVALS_ERROR_CODES, ERROR_CODES } from '@surefy/contracts'
import type { ApprovalTimeoutAction } from '@surefy/contracts'

export class ApprovalNotFoundError extends NotFoundError {
  constructor() {
    super(APPROVALS_ERROR_CODES.APPROVAL_NOT_FOUND, 'Approval not found')
  }
}

/** Someone decided first; `details` names them ("Omar already approved this"). */
export class ApprovalAlreadyDecidedError extends ConflictError {
  constructor(decidedBy: { id: string; name: string } | null, status: string) {
    super(APPROVALS_ERROR_CODES.APPROVAL_ALREADY_DECIDED, 'This approval was already decided', {
      details: [{ status, decidedBy }],
    })
  }
}

/** The wait ran out and the timeout already took its action (or is about to). */
export class ApprovalExpiredError extends ConflictError {
  constructor(timeoutAction: ApprovalTimeoutAction | null) {
    super(APPROVALS_ERROR_CODES.APPROVAL_EXPIRED, 'This approval expired', {
      details: [{ timeoutAction }],
    })
  }
}

/** Not among the assignees, without `approvals:decide`, or the agent or flow is out of reach. */
export class ApprovalNotAssignedError extends ForbiddenError {
  constructor() {
    super(APPROVALS_ERROR_CODES.APPROVAL_NOT_ASSIGNED, 'You are not assigned to decide this')
  }
}

export class ApprovalEditNotAllowedError extends UnprocessableError {
  constructor() {
    super(APPROVALS_ERROR_CODES.APPROVAL_EDIT_NOT_ALLOWED, 'This approval has no editable fields', {
      details: [{ field: 'editedInput' }],
    })
  }
}

/** The edited fields do not fit the action; nothing is recorded. */
export class ApprovalEditInvalidError extends UnprocessableError {
  constructor(fields: readonly string[]) {
    super(ERROR_CODES.VALIDATION_FAILED, 'The edited fields are not valid for this action', {
      details: fields.map((field) => ({ field: `editedInput.${field}` })),
    })
  }
}

export class ApprovalNotQuickApprovableError extends UnprocessableError {
  constructor() {
    super(
      APPROVALS_ERROR_CODES.APPROVAL_NOT_QUICK_APPROVABLE,
      'This approval cannot be decided in bulk',
    )
  }
}

/** Only the requester's pending request can be withdrawn. */
export class ApprovalNotCancelableError extends ConflictError {
  constructor() {
    super(APPROVALS_ERROR_CODES.APPROVAL_NOT_CANCELABLE, 'This approval cannot be withdrawn')
  }
}
