// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

/**
 * Guard's tabs in the order the design lists them; each is a route under `/[orgSlug]/guard/`.
 * The V1 tabs stay unlinked (`released: false`) until the integration task releases Guard in the
 * navigation; their pages answer at their address meanwhile. The tab bar shows from two tabs on.
 */
export const GUARD_TABS = [
  { value: 'overview', permission: PERMISSIONS.GUARD_READ, released: false },
  { value: 'defaults', permission: PERMISSIONS.GUARD_READ, released: false },
  { value: 'guardrails', permission: PERMISSIONS.GUARD_READ, released: false },
  { value: 'data-filters', permission: PERMISSIONS.GUARD_READ, released: false },
  { value: 'audit-log', permission: PERMISSIONS.AUDIT_READ, released: true },
] as const

export type GuardTabValue = (typeof GUARD_TABS)[number]['value']
