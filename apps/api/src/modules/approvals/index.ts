// SPDX-License-Identifier: AGPL-3.0-only
export { createApprovalsModule, type ApprovalsModule } from './approvals.module.js'
export { APPROVALS_JOBS, TIMEOUTS_EVERY_MS } from './approvals.constants.js'
export type {
  ApprovalLimits,
  ApprovalRequestOutcome,
  ApprovalRequests,
  ApprovalResolution,
  ApprovalSubjects,
  ApprovalsContext,
  ApprovalsGuard,
  CreateApprovalInput,
  CreatedApproval,
} from './approvals.types.js'
export type { ApprovalsService } from './approvals.service.js'
