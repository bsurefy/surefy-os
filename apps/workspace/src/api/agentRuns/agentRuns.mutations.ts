// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { RetryAgentRunInput } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { agentRunsApi } from './agentRuns.api'
import { agentRunKeys } from './agentRuns.queries'

/** Stops an open run. The run and the lists are read again. */
export function useCancelAgentRunMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (runId: string) => agentRunsApi.cancel(apiClient, orgId, runId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentRunKeys.all(orgId) }),
  })
}

/**
 * Starts a new run from a finished one. The answer is the queued run; "Retry step" asks to reuse
 * the earlier steps (`fromFailedStep`). The caller follows the new run's event stream.
 */
export function useRetryAgentRunMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ runId, ...input }: RetryAgentRunInput & { runId: string }) =>
      agentRunsApi.retry(apiClient, orgId, runId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentRunKeys.lists(orgId) }),
  })
}
