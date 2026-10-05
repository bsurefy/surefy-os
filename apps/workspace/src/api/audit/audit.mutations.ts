// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { auditApi } from './audit.api'
import { auditKeys } from './audit.queries'

/** Starts an on-demand check of the chain; the answer replaces the integrity status. */
export function useVerifyAuditMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: () => auditApi.verify(apiClient, orgId),
    onSuccess: (status) => {
      queryClient.setQueryData(auditKeys.integrity(orgId), status)
    },
  })
}
