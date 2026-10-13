// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

/**
 * Guard's tabs in the order the design lists them; each is a route under `/[orgSlug]/guard/`.
 * A tab is shown when the person holds its permission. The tab bar shows from two tabs on.
 */
export const GUARD_TABS = [
  { value: 'overview', permission: PERMISSIONS.GUARD_READ },
  { value: 'defaults', permission: PERMISSIONS.GUARD_READ },
  { value: 'guardrails', permission: PERMISSIONS.GUARD_READ },
  { value: 'data-filters', permission: PERMISSIONS.GUARD_READ },
  { value: 'audit-log', permission: PERMISSIONS.AUDIT_READ },
] as const

export type GuardTabValue = (typeof GUARD_TABS)[number]['value']
