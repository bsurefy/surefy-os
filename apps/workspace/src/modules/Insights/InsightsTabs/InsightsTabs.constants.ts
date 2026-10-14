// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'
import type { Permission } from '@surefy/contracts'

export type InsightsTabValue = 'overview' | 'runs' | 'approvals'

export interface InsightsTab {
  value: InsightsTabValue
  /** The route segment under `/[orgSlug]/insights/`; Overview has none. */
  segment: string | undefined
  anyPermission: readonly Permission[]
  released: boolean
}

/**
 * Insights' tabs in the order the design lists them; each is a route under `/[orgSlug]/insights/`
 * (Overview is the module's own address). A tab is shown when it is released and the person holds
 * one of its permissions: Builders read the overview and runs of their agents
 * (`insights:read-own`), and approvers of any role reach the queue without reading the usage
 * numbers. The bar shows from two tabs on.
 */
export const INSIGHTS_TABS: readonly InsightsTab[] = [
  {
    value: 'overview',
    segment: undefined,
    anyPermission: [PERMISSIONS.INSIGHTS_READ, PERMISSIONS.INSIGHTS_READ_OWN],
    released: true,
  },
  { value: 'runs', segment: 'runs', anyPermission: [PERMISSIONS.RUNS_READ], released: true },
  {
    value: 'approvals',
    segment: 'approvals',
    anyPermission: [PERMISSIONS.APPROVALS_READ],
    released: true,
  },
]
