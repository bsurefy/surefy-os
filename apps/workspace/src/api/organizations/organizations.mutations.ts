// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { UpdateOrganizationInput } from '@surefy/contracts'
import { meKeys } from '@surefy/web-core/api/me'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { organizationsApi } from './organizations.api'
import { organizationKeys } from './organizations.queries'

/** Saves the organization; the memberships in `GET /me` carry its name, slug and logo, so they refresh too. */
export function useUpdateOrganizationMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (input: UpdateOrganizationInput) =>
      organizationsApi.update(apiClient, orgId, input),
    onSuccess: (organization) => {
      queryClient.setQueryData(organizationKeys.detail(orgId), organization)
      return queryClient.invalidateQueries({ queryKey: meKeys.all() })
    },
  })
}
