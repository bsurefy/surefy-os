// SPDX-License-Identifier: AGPL-3.0-only
import type {
  ApprovalDetailDto,
  ApprovalDto,
  ApprovalSummaryDto,
  ApproveApprovalInput,
  BulkDecideInput,
  BulkDecideResultDto,
  RejectApprovalInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { ApprovalListFilters } from './approvals.queries'

/** Approvals: the queue, one item, and the decisions, as Insights and the top-bar popover use them. */
export const approvalsApi = {
  list: (http: HttpClient, orgId: string, query: ApprovalListFilters, signal?: AbortSignal) =>
    http.getPage<ApprovalDto>(`/orgs/${orgId}/approvals`, { params: { ...query }, signal }),
  summary: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.get<ApprovalSummaryDto>(`/orgs/${orgId}/approvals/summary`, { signal }),
  detail: (http: HttpClient, orgId: string, approvalId: string, signal?: AbortSignal) =>
    http.get<ApprovalDetailDto>(`/orgs/${orgId}/approvals/${approvalId}`, { signal }),
  /** Above the step-up amount the API answers `AUTH_SESSION_NOT_FRESH` until the person signs in again. */
  approve: (
    http: HttpClient,
    orgId: string,
    approvalId: string,
    input: Partial<ApproveApprovalInput> = {},
  ) => http.post<ApprovalDetailDto>(`/orgs/${orgId}/approvals/${approvalId}/approve`, input),
  reject: (http: HttpClient, orgId: string, approvalId: string, input: RejectApprovalInput) =>
    http.post<ApprovalDetailDto>(`/orgs/${orgId}/approvals/${approvalId}/reject`, input),
  bulkDecide: (http: HttpClient, orgId: string, input: BulkDecideInput) =>
    http.post<BulkDecideResultDto>(`/orgs/${orgId}/approvals/bulk-decide`, input),
}
