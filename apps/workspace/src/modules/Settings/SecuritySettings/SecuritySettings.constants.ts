// SPDX-License-Identifier: AGPL-3.0-only
import { FEATURES } from '@surefy/contracts'

/** Session lengths the picker offers, in hours; `default` keeps the app's own length (null). */
export const SESSION_LENGTH_OPTIONS = ['default', '8', '24', '168', '720'] as const
export type SessionLengthOption = (typeof SESSION_LENGTH_OPTIONS)[number]

/** The Enterprise sign-in features behind gate cards, in display order. */
export const GATED_SECURITY_FEATURES = [
  { feature: FEATURES.SSO, id: 'sso' },
  { feature: FEATURES.SCIM, id: 'scim' },
  { feature: FEATURES.IP_ALLOW_LIST, id: 'ipAllowList' },
] as const

/** The members query that counts who has no two-factor yet reads one page of this size. */
export const MEMBER_COUNT_LIMIT = 100
