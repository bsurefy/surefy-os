// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { ApproveApprovalInput } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { approvalsApi } from './approvals.api'
import { approvalKeys } from './approvals.queries'

/** Approves one item; the queue and its summary are read again. */
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
  })
}
