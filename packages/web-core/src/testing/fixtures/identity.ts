// SPDX-License-Identifier: AGPL-3.0-only
import {
  effectiveAccessDtoSchema,
  meDtoSchema,
  meMembershipDtoSchema,
  MODULES,
  ROLE_PERMISSIONS,
} from '@surefy/contracts'
import type { EffectiveAccessDto, MeDto, MeMembershipDto } from '@surefy/contracts'

import { defineFactory } from './defineFactory'

const UUID_SUFFIX_LENGTH = 12
const FIXTURE_TIME = '2026-01-15T09:00:00.000Z'
const FIXTURE_EXPIRY = '2026-01-22T09:00:00.000Z'

/** A valid, readable v4 UUID per kind and number: `fixtureUuid(1, 2)` → `…0001-4000-8000-000000000002`. */
export function fixtureUuid(kind: number, sequence: number): string {
  const kindPart = String(kind).padStart(4, '0')
  const sequencePart = String(sequence).padStart(UUID_SUFFIX_LENGTH, '0')
  return `00000000-${kindPart}-4000-8000-${sequencePart}`
}

const KIND = { user: 1, organization: 2, session: 3 } as const

/** An Owner's active membership of `acme-<n>`. */
export const meMembershipFactory = defineFactory(
  meMembershipDtoSchema,
  (sequence): MeMembershipDto => ({
    organization: {
      id: fixtureUuid(KIND.organization, sequence),
      name: `Acme ${sequence}`,
      slug: `acme-${sequence}`,
      logoUrl: null,
      status: 'active',
    },
    role: 'owner',
    primaryTeamId: null,
    joinedAt: FIXTURE_TIME,
  }),
)

/** `GET /api/v1/me`: a workspace session with one organization, no platform or partner roles. */
export const meFactory = defineFactory(meDtoSchema, (sequence): MeDto => ({
  user: {
    id: fixtureUuid(KIND.user, sequence),
    name: `Person ${sequence}`,
    email: `person${sequence}@acme.test`,
    emailVerified: true,
    imageUrl: null,
    twoFactorEnabled: false,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  },
  preferences: { locale: null, theme: 'system', timezone: null, lastOrganizationId: null },
  session: {
    id: fixtureUuid(KIND.session, sequence),
    app: 'workspace',
    createdAt: FIXTURE_TIME,
    expiresAt: FIXTURE_EXPIRY,
  },
  memberships: [meMembershipFactory()],
  platform: null,
  partners: [],
  supportAccess: [],
  isInstallAdmin: false,
  canCreateOrganization: false,
}))

/**
 * `GET /api/v1/orgs/:orgId/access/me` for a User on Community: every module, the role's default
 * permissions, no features, no limits. Tests override `role` and `permissions` together.
 */
export const effectiveAccessFactory = defineFactory(
  effectiveAccessDtoSchema,
  (): EffectiveAccessDto => ({
    role: 'user',
    teamIds: [],
    primaryTeamId: null,
    permissions: [...ROLE_PERMISSIONS.user],
    modules: [...MODULES],
    features: [],
    readOnlyFeatures: [],
    license: null,
    allowedModelIds: [],
    limits: {
      monthlySpendMicros: null,
      maxAgents: null,
      maxFlows: null,
      maxRunsPerMonth: null,
      maxStorageBytes: null,
      maxKnowledgeBases: null,
    },
    reasons: [],
  }),
)
