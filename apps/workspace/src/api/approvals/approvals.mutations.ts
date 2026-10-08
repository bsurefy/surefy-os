// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { ApproveApprovalInput, BulkDecideInput, RejectApprovalInput } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { approvalsApi } from './approvals.api'
import { approvalKeys } from './approvals.queries'

/** A decision changes the queue, the badge count and the item, so the whole domain refetches. */
export function useApproveApprovalMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({
      approvalId,
      ...input
    }: Partial<ApproveApprovalInput> & { approvalId: string }) =>
      approvalsApi.approve(apiClient, orgId, approvalId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all(orgId) }),
    // someone else may have decided first: the queue shows the truth either way
    onError: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all(orgId) }),
  })
}

export function useRejectApprovalMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ approvalId, ...input }: RejectApprovalInput & { approvalId: string }) =>
      approvalsApi.reject(apiClient, orgId, approvalId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all(orgId) }),
    onError: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all(orgId) }),
  })
}

export function useBulkDecideApprovalsMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: BulkDecideInput) => approvalsApi.bulkDecide(apiClient, orgId, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: approvalKeys.all(orgId) }),
  })
}
