// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
} from '@/core/errors/index.js'
import { GUARD_ERROR_CODES } from '@surefy/contracts'
import type { PiiType } from '@surefy/contracts'

export class GuardRuleNotFoundError extends NotFoundError {
  constructor() {
    super(GUARD_ERROR_CODES.GUARD_RULE_NOT_FOUND, 'Guardrail not found')
  }
}

export class GuardRuleNameTakenError extends ConflictError {
  constructor() {
    super(GUARD_ERROR_CODES.GUARD_RULE_NAME_TAKEN, 'A guardrail with this name already exists', {
      details: [{ field: 'name' }],
    })
  }
}

/** An Owner locked it: only Owners change, disable or delete it. */
export class GuardRuleLockedError extends ForbiddenError {
  constructor() {
    super(GUARD_ERROR_CODES.GUARD_RULE_LOCKED, 'This guardrail is locked by an Owner')
  }
}

export class GuardRuleTypeImmutableError extends UnprocessableError {
  constructor() {
    super(GUARD_ERROR_CODES.GUARD_RULE_TYPE_IMMUTABLE, 'A guardrail keeps its type', {
      details: [{ field: 'definition.kind' }],
    })
  }
}

export class GuardThresholdsInvalidError extends UnprocessableError {
  constructor() {
    super(
      GUARD_ERROR_CODES.GUARD_THRESHOLDS_INVALID,
      'The review threshold must be below the automatic one',
      { details: [{ field: 'reviewThresholdBp' }] },
    )
  }
}

/** Loosening, turning off or deleting is T2: the reason goes to the audit log. */
export class GuardReasonRequiredError extends UnprocessableError {
  constructor() {
    super(GUARD_ERROR_CODES.GUARD_REASON_REQUIRED, 'This change needs a reason', {
      details: [{ field: 'reason' }],
    })
  }
}

/** An agent or flow value below the organization's. */
export class GuardLooserThanParentError extends UnprocessableError {
  constructor(field: string) {
    super(
      GUARD_ERROR_CODES.GUARD_LOOSER_THAN_PARENT,
      "This is looser than the organization's Guard settings",
      { details: [{ field }] },
    )
  }
}

export class GuardPiiRuleNotFoundError extends NotFoundError {
  constructor() {
    super(GUARD_ERROR_CODES.GUARD_PII_RULE_NOT_FOUND, 'Data filter rule not found')
  }
}

export class GuardPiiRuleDuplicateError extends ConflictError {
  constructor() {
    super(
      GUARD_ERROR_CODES.GUARD_PII_RULE_DUPLICATE,
      'This type already has a rule here; change that one',
    )
  }
}

export class GuardPiiPatternInvalidError extends UnprocessableError {
  constructor(reason: string) {
    super(GUARD_ERROR_CODES.GUARD_PII_PATTERN_INVALID, reason, {
      details: [{ field: 'customPattern' }],
    })
  }
}

/** The personal-data filter blocks a type found in the request; nothing leaves. */
export class GuardPiiBlockedError extends UnprocessableError {
  constructor(types: readonly PiiType[]) {
    super(
      GUARD_ERROR_CODES.GUARD_PII_BLOCKED,
      'The request contains personal data that the data filter blocks',
      { details: types.map((type) => ({ field: type })) },
    )
  }
}
