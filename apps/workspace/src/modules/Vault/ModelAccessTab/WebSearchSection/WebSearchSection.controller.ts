// SPDX-License-Identifier: AGPL-3.0-only
import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { effectiveAccessQueries, useUpdateTeamPolicyMutation } from '@/api/access'
import { vaultQueries } from '@/api/vault'
import type { AccessPolicyDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage } from '@surefy/web-core/errors'

import { useAccessSubjects } from '../../Vault.hooks'

/** Web search is on for a team unless its own policy turns it off (absent means "inherit"). */
export const isWebSearchOn = (policy: AccessPolicyDto | undefined): boolean =>
  policy?.policy.tools?.webSearch !== false

/**
 * Web search per team (Vault › Model access): reads each team's own access policy and writes the
 * whole document back with `tools.webSearch` changed, because the route replaces the policy.
 */
export function useWebSearchSectionController() {
  const t = useTranslations('vault.modelAccess.webSearch')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const subjects = useAccessSubjects()
  const update = useUpdateTeamPolicyMutation(orgId, { silent: true })

  const policies = useQueries({
    queries: subjects.teams.map((team) => effectiveAccessQueries.teamPolicy(orgId, team.id)),
  })
  const organizationPolicy = useQuery(effectiveAccessQueries.organizationPolicy(orgId))
  const searchProviders = useQuery(vaultQueries.searchProviders(orgId))

  const rows = subjects.teams.map((team, index) => ({
    team,
    policy: policies[index]?.data,
    isLoading: policies[index]?.isPending ?? true,
    error: policies[index]?.error ?? null,
  }))

  const onToggle = (teamId: string, enabled: boolean) => {
    const current = rows.find((row) => row.team.id === teamId)
    if (!current?.policy) return
    const policy = {
      ...current.policy.policy,
      tools: { ...current.policy.policy.tools, webSearch: enabled },
    }
    update.mutate(
      { teamId, policy },
      {
        onSuccess: () => {
          toast.success(t(enabled ? 'enabled' : 'disabled', { team: current.team.name }))
        },
        onError: (error) => {
          toast.error(t('saveFailed', { team: current.team.name }), {
            description: getErrorMessage(error, tErrors),
          })
        },
      },
    )
  }

  return {
    t,
    rows,
    isLoading: subjects.isLoading,
    isOrganizationOff: organizationPolicy.data?.policy.tools?.webSearch === false,
    // unknown (still loading or failed) counts as "has one" so the warning never flashes
    hasSearchProvider: searchProviders.data ? searchProviders.data.active !== null : true,
    savingTeamId: update.isPending ? update.variables.teamId : undefined,
    onToggle,
  }
}
