// SPDX-License-Identifier: AGPL-3.0-only
/** Organization roles, lowest to highest. Code checks permissions, never role names. */
export const ORG_ROLES = ['user', 'builder', 'admin', 'owner'] as const
export type OrgRole = (typeof ORG_ROLES)[number]

/** Platform (BSurefy staff) roles; used on Cloud only. */
export const PLATFORM_ROLES = [
  'super_admin',
  'platform_admin',
  'support',
  'billing',
  'partner_manager',
  'security',
  'viewer',
] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

/** Partner staff roles; used on Cloud only. */
export const PARTNER_ROLES = [
  'partner_owner',
  'partner_admin',
  'partner_sales',
  'partner_support',
] as const
export type PartnerRole = (typeof PARTNER_ROLES)[number]

/** True when `role` is at least `minimum` in the organization role order. */
export function roleAtLeast(role: OrgRole, minimum: OrgRole): boolean {
  return ORG_ROLES.indexOf(role) >= ORG_ROLES.indexOf(minimum)
}
