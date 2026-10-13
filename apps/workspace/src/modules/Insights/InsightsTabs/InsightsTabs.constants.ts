// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

/**
 * Insights' tabs in the order the design lists them; each is a route under `/[orgSlug]/insights/`
 * (Overview is the module's own address). A tab is shown when it is released and the person holds
 * one of its permissions: Builders read the overview and runs of their agents
 * (`insights:read-own`), and approvers of any role reach the queue without reading the usage
 * numbers. Runs stays unlinked until its integration task (I6-04) releases it. The bar shows from
 * two tabs on.
 */
export const INSIGHTS_TABS = [
  {
    value: 'overview',
    segment: undefined,
    anyPermission: [PERMISSIONS.INSIGHTS_READ, PERMISSIONS.INSIGHTS_READ_OWN],
    released: true,
  },
  { value: 'runs', segment: 'runs', anyPermission: [PERMISSIONS.RUNS_READ], released: false },
  {
    value: 'approvals',
    segment: 'approvals',
    anyPermission: [PERMISSIONS.APPROVALS_READ],
    released: true,
  },
] as const

export type InsightsTabValue = (typeof INSIGHTS_TABS)[number]['value']
