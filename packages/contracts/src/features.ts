// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Enterprise and Cloud capabilities. Code gates on these keys, never on the edition
 * (docs: plan/editions.md, "Features in code").
 */
export const FEATURES = {
  SSO: 'sso',
  SCIM: 'scim',
  CUSTOM_ROLES: 'custom-roles',
  AUDIT_EXPORT: 'audit-export',
  AUDIT_SIEM: 'audit-siem',
  COMPLIANCE_REPORTS: 'compliance-reports',
  IP_ALLOW_LIST: 'ip-allow-list',
  RETENTION_POLICIES: 'retention-policies',
  WHITE_LABEL: 'white-label',
  DATA_REGIONS: 'data-regions',
  MULTI_ORGANIZATION: 'multi-organization',
} as const
export type Feature = (typeof FEATURES)[keyof typeof FEATURES]

export type Edition = 'community' | 'enterprise' | 'cloud'

/** Minimum edition per feature, used only for upgrade messaging, never for gating. */
export const FEATURE_EDITIONS = {
  [FEATURES.SSO]: { minimum: 'enterprise' },
  [FEATURES.SCIM]: { minimum: 'enterprise' },
  [FEATURES.CUSTOM_ROLES]: { minimum: 'enterprise' },
  [FEATURES.AUDIT_EXPORT]: { minimum: 'enterprise' },
  [FEATURES.AUDIT_SIEM]: { minimum: 'enterprise' },
  [FEATURES.COMPLIANCE_REPORTS]: { minimum: 'enterprise' },
  [FEATURES.IP_ALLOW_LIST]: { minimum: 'enterprise' },
  [FEATURES.RETENTION_POLICIES]: { minimum: 'enterprise' },
  [FEATURES.WHITE_LABEL]: { minimum: 'enterprise' },
  [FEATURES.DATA_REGIONS]: { minimum: 'cloud' },
  [FEATURES.MULTI_ORGANIZATION]: { minimum: 'enterprise' },
} as const satisfies Record<Feature, { minimum: Exclude<Edition, 'community'> }>
