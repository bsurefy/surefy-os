// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useQueryState } from 'nuqs'

import { guardQueries } from '@/api/guard'
import { PERMISSIONS } from '@surefy/contracts'
import type { GuardOverviewRange } from '@surefy/contracts'
import { useCan, useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { DEFAULT_GUARD_RANGE, GUARD_RANGES } from './GuardOverview.constants'
import { guardOverviewSearchParams } from './GuardOverview.searchParams'
import { getCheckedTotal, isOverviewEmpty } from './GuardOverview.utils'

/** Guard › Overview: the period in the URL and the checks, blocks and open items of that period. */
export function useGuardOverviewController() {
  const t = useTranslations('guard.overview')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const [range, setRange] = useQueryState('range', guardOverviewSearchParams.range)
  const canReadApprovals = useCan(PERMISSIONS.APPROVALS_READ)
  const overview = useQuery(guardQueries.overview(orgId, range))
  const data = overview.data

  return {
    t,
    range,
    rangeOptions: GUARD_RANGES.map((value) => ({ value, label: t(`range.${value}`) })),
    onRangeChange: (next: GuardOverviewRange) => {
      void setRange(next === DEFAULT_GUARD_RANGE ? null : next)
    },
    data,
    isLoading: overview.isPending,
    errorMessage: overview.error ? getErrorMessage(overview.error, tErrors) : null,
    errorReference: isApiError(overview.error) ? overview.error.requestId : undefined,
    refetch: () => void overview.refetch(),
    checkedTotal: data ? getCheckedTotal(data) : 0,
    isEmpty: data ? isOverviewEmpty(data) : false,
    /** Deciding belongs to those who hold `approvals:decide`; reading the queue to those who read it. */
    canOpenQueue: canReadApprovals,
  }
}
