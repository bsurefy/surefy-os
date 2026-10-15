// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { UpdateAccessPolicyInput } from '@surefy/contracts'
import { accessKeys } from '@surefy/web-core/api/access'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { effectiveAccessApi } from './access.api'

/**
 * Replaces a team's own restrictions. A policy changes what people may do, so everything under the
 * organization's `access` segment refreshes, including the signed-in person's effective access.
 */
export function useUpdateTeamPolicyMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ teamId, policy }: { teamId: string; policy: UpdateAccessPolicyInput }) =>
      effectiveAccessApi.updateTeamPolicy(apiClient, orgId, teamId, policy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessKeys.all(orgId) }),
  })
}
