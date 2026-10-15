// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'

import { memberQueries } from '@/api/members'
import { PERMISSIONS } from '@surefy/contracts'
import { useCan } from '@surefy/web-core/access'

import { PICKER_PAGE_SIZE } from '../UsageBudgetsSettings.constants'
import { getChargingExamples } from '../UsageBudgetsSettings.utils'

/** The people in several teams, named as examples of primary-team charging. */
export function useChargingNoteController({ orgId }: { orgId: string }) {
  const t = useTranslations('settings.usage.charging')
  const format = useFormatter()
  const canReadMembers = useCan(PERMISSIONS.MEMBERS_READ)
  const members = useInfiniteQuery({
    ...memberQueries.list(orgId, { status: 'active', limit: PICKER_PAGE_SIZE }),
    enabled: canReadMembers,
  })
  // examples only: a failed or slow load leaves the general rule on its own
  const examples = getChargingExamples(members.data?.pages[0]?.items ?? []).map((example) => ({
    ...example,
    teamList: format.list(example.teams, { type: 'conjunction' }),
  }))
  return { examples, t }
}
