// SPDX-License-Identifier: AGPL-3.0-only
import type { ApprovalDto, ApproveApprovalInput } from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

/** The approvals queue (Insights › Approvals). */
export const approvalsApi = {
  /** Approves an item the person is assigned to; the action it guards then runs. */
  approve: (
    http: HttpClient,
    orgId: string,
    approvalId: string,
    input: Partial<ApproveApprovalInput> = {},
  ) => http.post<ApprovalDto>(`/orgs/${orgId}/approvals/${approvalId}/approve`, input),
}
