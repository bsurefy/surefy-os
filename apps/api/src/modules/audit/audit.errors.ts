// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictError, NotFoundError } from '@/core/errors/index.js'
import { ERROR_CODES } from '@surefy/contracts'

export class AuditEntryNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.AUDIT_ENTRY_NOT_FOUND, 'Audit entry not found')
  }
}

/** One on-demand verification per organization at a time. */
export class AuditVerificationRunningError extends ConflictError {
  constructor() {
    super(ERROR_CODES.AUDIT_VERIFICATION_RUNNING, 'A verification is already running')
  }
}
