// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { userRefDtoSchema } from '../auth/schemas.js'
import { MODULES } from '../core/modules.js'
import { orgParamsSchema } from '../core/params.js'
import { ORG_ROLES } from '../core/roles.js'
import { FEATURES } from '../features.js'
import { PERMISSIONS } from '../permissions.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Effective access and the restrictions each level sets (backend/authorization.md §4–5,
// database/access-and-entitlements.md). Routes:
// GET /api/v1/orgs/:orgId/access/me · GET /api/v1/orgs/:orgId/access/members/:userId ·
// GET /api/v1/orgs/:orgId/access/teams/:teamId · GET/PUT /api/v1/orgs/:orgId/access/policy ·
// GET/PUT /api/v1/orgs/:orgId/teams/:teamId/access-policy.

export const featureSchema = z.enum(Object.values(FEATURES))
export const permissionSchema = z.enum(Object.values(PERMISSIONS))
export const moduleKeySchema = z.enum(MODULES)

/** Where models may come from: Cloud platform credits, the organization's own keys, or both. */
export const MODEL_SOURCES = ['platform', 'own'] as const
export type ModelSource = (typeof MODEL_SOURCES)[number]

export const ACCESS_LIMIT_KEYS = [
  'maxAgents',
  'maxFlows',
  'maxRunsPerMonth',
  'maxStorageBytes',
  'maxKnowledgeBases',
] as const
export type AccessLimitKey = (typeof ACCESS_LIMIT_KEYS)[number]

const limitValueSchema = z.number().int().nonnegative()
const providerKeySchema = z.string().trim().min(1).max(100)

/**
 * `AccessPolicy` v1: one level's own restrictions (`access_policies.policy`). Every field is optional;
 * an absent field inherits the parent level unchanged. Allow-lists intersect, booleans AND, limits
 * take the minimum and denials unite down the chain.
 */
export const accessPolicySchema = z.object({
  version: z.literal(1),
  modules: z.array(moduleKeySchema).max(MODULES.length).optional(),
  providers: z
    .object({
      allowed: z.array(providerKeySchema).max(100).optional(),
      personalKeys: z.boolean().optional(),
      localModels: z.boolean().optional(),
      modelSources: z.array(z.enum(MODEL_SOURCES)).max(MODEL_SOURCES.length).optional(),
    })
    .optional(),
  tools: z
    .object({
      webSearch: z.boolean().optional(),
      bridge: z.boolean().optional(),
      mcp: z.boolean().optional(),
      apiTools: z.boolean().optional(),
    })
    .optional(),
  limits: z
    .object({
      maxAgents: limitValueSchema.optional(),
      maxFlows: limitValueSchema.optional(),
      maxRunsPerMonth: limitValueSchema.optional(),
      maxStorageBytes: limitValueSchema.optional(),
      maxKnowledgeBases: limitValueSchema.optional(),
    })
    .optional(),
  training: z
    .object({
      enabled: z.boolean().optional(),
      fineTuning: z.boolean().optional(),
    })
    .optional(),
  deniedFeatures: z.array(featureSchema).max(Object.keys(FEATURES).length).optional(),
})
export type AccessPolicy = z.infer<typeof accessPolicySchema>

/** `PUT …/access/policy` replaces the whole document; `{ version: 1 }` means "no restrictions here". */
export const updateAccessPolicyInputSchema = accessPolicySchema
export type UpdateAccessPolicyInput = z.infer<typeof updateAccessPolicyInputSchema>

/** The organization's (`teamId` null) or a team's own restrictions; `updatedAt` null when no row exists. */
export const accessPolicyDtoSchema = z.object({
  teamId: z.uuid().nullable(),
  policy: accessPolicySchema,
  updatedByUserId: z.uuid().nullable(),
  updatedAt: z.iso.datetime().nullable(),
})
export type AccessPolicyDto = z.infer<typeof accessPolicyDtoSchema>

export const LICENSE_STATES = ['valid', 'expiring', 'grace', 'expired'] as const
export type LicenseState = (typeof LICENSE_STATES)[number]

/** Self-hosted Enterprise license state, computed by the entitlement source; the UI never computes dates. */
export const licenseStatusDtoSchema = z.object({
  state: z.enum(LICENSE_STATES),
  expiresAt: z.iso.datetime().nullable(),
  /** End of the read-only grace period; null outside `grace`. */
  graceEndsAt: z.iso.datetime().nullable(),
})
export type LicenseStatusDto = z.infer<typeof licenseStatusDtoSchema>

/** Effective numeric limits; null = unlimited. Money is integer micros. */
export const accessLimitsDtoSchema = z.object({
  monthlySpendMicros: limitValueSchema.nullable(),
  maxAgents: limitValueSchema.nullable(),
  maxFlows: limitValueSchema.nullable(),
  maxRunsPerMonth: limitValueSchema.nullable(),
  maxStorageBytes: limitValueSchema.nullable(),
  maxKnowledgeBases: limitValueSchema.nullable(),
})
export type AccessLimitsDto = z.infer<typeof accessLimitsDtoSchema>

/** The level that switched something off. `community`, `plan` and `license` are the entitlement sources. */
export const ACCESS_REASON_SOURCES = [
  'community',
  'plan',
  'license',
  'partner',
  'organization',
  'team',
  'role',
  'feature',
  'grant',
] as const
export type AccessReasonSource = (typeof ACCESS_REASON_SOURCES)[number]

/**
 * Why something is off: `key` names it (`module:train`, `feature:sso`, `permission:agents:publish`,
 * `limit:maxAgents`, `tool:webSearch`, `training:fineTuning`), `source` the deciding level, `teamId`
 * the deciding team. Powers the effective access view and disabled-with-explanation states.
 */
export const accessReasonDtoSchema = z.object({
  key: z.string().min(1),
  source: z.enum(ACCESS_REASON_SOURCES),
  teamId: z.uuid().optional(),
})
export type AccessReasonDto = z.infer<typeof accessReasonDtoSchema>

/** Enabled, available models with a matching access rule; `'all'` only for system contexts. */
export const allowedModelIdsSchema = z.union([z.array(z.uuid()), z.literal('all')])

/**
 * `GET /api/v1/orgs/:orgId/access/me`: `EffectiveAccess` for the signed-in actor. `useCan`,
 * `useHasModule` and `FeatureGate` read `permissions`, `modules` and `features`; `role` is null
 * for API keys and access grants. During a license's grace days every feature moves to
 * `readOnlyFeatures`.
 */
export const effectiveAccessDtoSchema = z.object({
  role: z.enum(ORG_ROLES).nullable(),
  teamIds: z.array(z.uuid()),
  primaryTeamId: z.uuid().nullable(),
  permissions: z.array(permissionSchema),
  modules: z.array(moduleKeySchema),
  features: z.array(featureSchema),
  readOnlyFeatures: z.array(featureSchema),
  license: licenseStatusDtoSchema.nullable(),
  allowedModelIds: allowedModelIdsSchema,
  limits: accessLimitsDtoSchema,
  reasons: z.array(accessReasonDtoSchema),
})
export type EffectiveAccessDto = z.infer<typeof effectiveAccessDtoSchema>

/** `GET /api/v1/orgs/:orgId/access/members/:userId` (Roles & access › Effective access, a person). */
export const memberEffectiveAccessDtoSchema = effectiveAccessDtoSchema.extend({
  user: userRefDtoSchema,
  teams: z.array(teamRefDtoSchema),
})
export type MemberEffectiveAccessDto = z.infer<typeof memberEffectiveAccessDtoSchema>

export const accessMemberParamsSchema = orgParamsSchema.extend({ userId: z.uuid() })
export type AccessMemberParams = z.infer<typeof accessMemberParamsSchema>

/** `GET /api/v1/orgs/:orgId/access/teams/:teamId`: the team level, before any role filter. */
export const teamEffectiveAccessDtoSchema = z.object({
  team: teamRefDtoSchema,
  modules: z.array(moduleKeySchema),
  features: z.array(featureSchema),
  allowedModelIds: allowedModelIdsSchema,
  limits: accessLimitsDtoSchema,
  reasons: z.array(accessReasonDtoSchema),
})
export type TeamEffectiveAccessDto = z.infer<typeof teamEffectiveAccessDtoSchema>

export const MINIMUM_EDITIONS = ['enterprise', 'cloud'] as const

/** `details[]` of `LIMIT_REACHED`: which limit, its value, where it comes from and what lifts it. */
export const limitReachedDetailSchema = z.object({
  /** `organizations`, `seats`, or an `ACCESS_LIMIT_KEYS` value. */
  limit: z.string().min(1),
  max: z.number().int().nullable(),
  used: z.number().int().nonnegative().optional(),
  source: z.enum(ACCESS_REASON_SOURCES),
  minimumEdition: z.enum(MINIMUM_EDITIONS).optional(),
})
export type LimitReachedDetail = z.infer<typeof limitReachedDetailSchema>

/** `details[]` of `ACCESS_EXCEEDS_PARENT`: the policy field and the parent value it may not exceed. */
export const accessExceedsParentDetailSchema = z.object({
  field: z.string().min(1),
  parentValue: z.unknown(),
  parentSource: z.enum(ACCESS_REASON_SOURCES),
})
export type AccessExceedsParentDetail = z.infer<typeof accessExceedsParentDetailSchema>

/** `details[]` of `FEATURE_NOT_AVAILABLE`: lets the workspace pick the right upgrade card. */
export const featureNotAvailableDetailSchema = z.object({
  feature: featureSchema,
  minimumEdition: z.enum(MINIMUM_EDITIONS),
})
export type FeatureNotAvailableDetail = z.infer<typeof featureNotAvailableDetailSchema>
