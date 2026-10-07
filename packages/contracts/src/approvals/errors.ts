// SPDX-License-Identifier: AGPL-3.0-only
/** Error codes of the approvals domain (UPPER_SNAKE_CASE, <DOMAIN>_<PROBLEM>; never renamed or reused). */
export const APPROVALS_ERROR_CODES = {
  APPROVAL_NOT_FOUND: 'APPROVAL_NOT_FOUND', // 404
  APPROVAL_ALREADY_DECIDED: 'APPROVAL_ALREADY_DECIDED', // 409: someone else decided first; `details` names them
  APPROVAL_EXPIRED: 'APPROVAL_EXPIRED', // 409: the timeout already took its action
  APPROVAL_NOT_ASSIGNED: 'APPROVAL_NOT_ASSIGNED', // 403: the person is not among the assignees, or cannot see the agent or flow
  APPROVAL_REASON_REQUIRED: 'APPROVAL_REASON_REQUIRED', // 422: a person rejecting must give a reason
  APPROVAL_EDIT_NOT_ALLOWED: 'APPROVAL_EDIT_NOT_ALLOWED', // 422: only AI actions and flow steps have editable fields
  APPROVAL_NOT_QUICK_APPROVABLE: 'APPROVAL_NOT_QUICK_APPROVABLE', // 422: over the quick-approve limits, needs step-up, or another rule
  APPROVAL_NOT_CANCELABLE: 'APPROVAL_NOT_CANCELABLE', // 409: only the requester's pending request can be withdrawn
} as const
