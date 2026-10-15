// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'
import type { AccessExceedsParentDetail, BudgetExceededDetail } from '@surefy/contracts'

export class BudgetNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.BUDGET_NOT_FOUND, 'Budget not found')
  }
}

/** One budget per organization, team or person. */
export class BudgetAlreadyExistsError extends ConflictError {
  constructor() {
    super(ERROR_CODES.BUDGET_ALREADY_EXISTS, 'This already has a budget')
  }
}

/** The team or member does not exist in the organization. */
export class BudgetTargetNotFoundError extends UnprocessableError {
  constructor() {
    super(ERROR_CODES.BUDGET_TARGET_NOT_FOUND, 'The team or member was not found')
  }
}

/** A team or personal budget above the enabled organization budget. */
export class BudgetExceedsParentError extends UnprocessableError {
  constructor(organizationAmountMicros: number) {
    const detail: AccessExceedsParentDetail = {
      field: 'amountMicros',
      parentValue: organizationAmountMicros,
      parentSource: 'organization',
    }
    super(ERROR_CODES.ACCESS_EXCEEDS_PARENT, 'This is more than the organization budget', {
      details: [detail],
    })
  }
}

/** A reached budget stops cloud models (429, apart from `RATE_LIMITED`). */
export class BudgetExceededError extends TooManyRequestsError {
  constructor(readonly detail: BudgetExceededDetail) {
    super(ERROR_CODES.BUDGET_EXCEEDED, 'The AI budget is reached', { details: [{ ...detail }] })
  }
}
