// SPDX-License-Identifier: AGPL-3.0-only
import { ROUTES } from '@/constants/routes'
import type { GuardAttentionItemDto, GuardOverviewDto } from '@surefy/contracts'

import { HOUR_THRESHOLD_MINUTES } from './GuardOverview.constants'

/** Actions that went through the confidence bands (blocked ones never reached a band). */
export function getCheckedTotal(overview: GuardOverviewDto): number {
  return overview.auto + overview.doubleChecked + overview.needsPerson
}

/** Whether Guard has seen nothing in the period: no checks, blocks, hidden data or local calls. */
export function isOverviewEmpty(overview: GuardOverviewDto): boolean {
  return (
    getCheckedTotal(overview) === 0 &&
    overview.blockedByLimits === 0 &&
    overview.personalDataHidden === 0 &&
    overview.ranOnLocalModels === 0 &&
    overview.attention.length === 0
  )
}

/** A band's share of the checked actions, 0 to 1; 0 when nothing was checked. */
export function getShare(count: number, total: number): number {
  return total === 0 ? 0 : count / total
}

/** The median as a count and a unit, so the screen can say "14 minutes" or "2 hours". */
export function splitMedian(minutes: number): { unit: 'minutes' | 'hours'; count: number } {
  if (minutes < HOUR_THRESHOLD_MINUTES)
    return { unit: 'minutes', count: Math.max(1, Math.round(minutes)) }
  return { unit: 'hours', count: Math.round(minutes / HOUR_THRESHOLD_MINUTES) }
}

/** Where "Needs your attention" sends the person: the queue, the rule, or the agent's Guard tab. */
export function getAttentionHref(item: GuardAttentionItemDto, orgSlug: string): string {
  const { target } = item
  switch (target.type) {
    case 'approvals':
      return ROUTES.workspace.insights(orgSlug, 'approvals')
    case 'guardrail':
      return target.id
        ? `${ROUTES.workspace.guard(orgSlug, 'guardrails')}?rule=${target.id}`
        : ROUTES.workspace.guard(orgSlug, 'guardrails')
    case 'agent':
      return target.id
        ? ROUTES.workspace.agent(orgSlug, target.id, 'guard')
        : ROUTES.workspace.agents(orgSlug)
  }
}
