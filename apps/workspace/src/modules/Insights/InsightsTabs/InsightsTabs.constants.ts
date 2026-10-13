// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

/**
 * Insights' tabs in the order the design lists them; each is a route under `/[orgSlug]/insights/`
 * (Overview is the module's own address). A tab is shown when it is released and the person holds
 * its permission: approvers of any role reach the queue without reading the usage numbers. Runs
 * stays unlinked until its screen is released. The bar shows from two tabs on.
 */
export const INSIGHTS_TABS = [
  { value: 'overview', segment: undefined, permission: PERMISSIONS.INSIGHTS_READ, released: true },
  { value: 'runs', segment: 'runs', permission: PERMISSIONS.INSIGHTS_READ, released: false },
  {
    value: 'approvals',
    segment: 'approvals',
    permission: PERMISSIONS.APPROVALS_READ,
    released: true,
  },
] as const

export type InsightsTabValue = (typeof INSIGHTS_TABS)[number]['value']
