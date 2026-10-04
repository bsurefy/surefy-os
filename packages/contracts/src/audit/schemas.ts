// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { multiValueQuery, searchQuery } from '../core/filters.js'
import { pageQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'

// The append-only, hash-chained audit log (database/usage-budgets-and-audit.md §4–5; Guard › Audit log).
// Routes: GET /api/v1/orgs/:orgId/audit/entries · GET /api/v1/orgs/:orgId/audit/entries/:entryId ·
// GET /api/v1/orgs/:orgId/audit/integrity · POST /api/v1/orgs/:orgId/audit/verify (202).
// Exports of the log are `exports` rows of kind `audit_csv` / `audit_json` (dataControl, `audit-export`).

export const AUDIT_ACTOR_TYPES = [
  'user',
  'api_key',
  'agent',
  'flow',
  'system',
  'support',
  'partner',
] as const
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number]

/** How the request reached the API; matches `TenantContext.via`. */
export const AUDIT_VIAS = ['user', 'api-key', 'support', 'partner', 'system'] as const
export type AuditVia = (typeof AUDIT_VIAS)[number]

export const AUDIT_OUTCOMES = ['success', 'denied', 'failed'] as const
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number]

/** `<area>.<verb>`, lowercase snake. The app checks the value against the domains' action lists. */
export const AUDIT_ACTION_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/
export const auditActionSchema = z.string().regex(AUDIT_ACTION_PATTERN)

/** `agent`, `member`, `organization`…; lowercase snake. */
export const AUDIT_TARGET_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/
export const auditTargetTypeSchema = z.string().regex(AUDIT_TARGET_TYPE_PATTERN)

/**
 * Actions written by the identity and organization modules. Later domains declare their own
 * `<DOMAIN>_AUDIT_ACTIONS` in their folder, following the same `<area>.<verb>` format.
 */
export const AUDIT_ACTIONS = {
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  ORGANIZATION_SLUG_CHANGED: 'organization.slug_changed',
  ORGANIZATION_DELETION_SCHEDULED: 'organization.deletion_scheduled',
  ORGANIZATION_DELETION_CANCELED: 'organization.deletion_canceled',
  ORGANIZATION_EXPORT_REQUESTED: 'organization.export_requested',
  MEMBER_INVITED: 'member.invited',
  MEMBER_JOINED: 'member.joined',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_PRIMARY_TEAM_CHANGED: 'member.primary_team_changed',
  MEMBER_DEACTIVATED: 'member.deactivated',
  MEMBER_REACTIVATED: 'member.reactivated',
  MEMBER_REMOVED: 'member.removed',
  INVITATION_RESENT: 'invitation.resent',
  INVITATION_LINK_COPIED: 'invitation.link_copied',
  INVITATION_REVOKED: 'invitation.revoked',
  TEAM_CREATED: 'team.created',
  TEAM_UPDATED: 'team.updated',
  TEAM_DELETED: 'team.deleted',
  TEAM_MEMBER_ADDED: 'team.member_added',
  TEAM_MEMBER_REMOVED: 'team.member_removed',
  ACCESS_POLICY_UPDATED: 'access_policy.updated',
  INSTALL_SETTINGS_UPDATED: 'install.settings_updated',
  INSTALL_ADMIN_ADDED: 'install.admin_added',
  INSTALL_ADMIN_REMOVED: 'install.admin_removed',
  USER_TWO_FACTOR_RESET: 'user.two_factor_reset',
  SESSION_REVOKED: 'session.revoked',
  EXPORT_REQUESTED: 'export.requested',
  EXPORT_DOWNLOADED: 'export.downloaded',
  AUDIT_VERIFIED: 'audit.verified',
} as const
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

/** Target types used by the identity and organization modules. */
export const AUDIT_TARGET_TYPES = [
  'organization',
  'member',
  'invitation',
  'team',
  'access_policy',
  'install',
  'user',
  'session',
  'export',
  'data_request',
  'audit_log',
] as const
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number]

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

/**
 * `AuditMetadata` v1: never content (no prompts, messages, document text or secrets). `changes`
 * lists non-secret settings values before and after; `counts`, `refs` and `codes` are small lookups.
 * Each action's own typed shape is layered on this by its module.
 */
export const auditMetadataSchema = z.object({
  version: z.literal(1),
  changes: z
    .array(z.object({ field: z.string().min(1), from: z.unknown(), to: z.unknown() }))
    .optional(),
  counts: z.record(z.string(), z.number().int()).optional(),
  refs: z.record(z.string(), z.string()).optional(),
  codes: z.array(z.string()).optional(),
  labels: z.record(z.string(), scalarSchema).optional(),
})
export type AuditMetadata = z.infer<typeof auditMetadataSchema>

/** sha256 as 64 lowercase hex characters. */
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/)

export const auditActorDtoSchema = z.object({
  type: z.enum(AUDIT_ACTOR_TYPES),
  /** The person, or the staff member for `support` and `partner`. */
  userId: z.uuid().nullable(),
  apiKeyId: z.uuid().nullable(),
  /** Agent or flow id for `agent` and `flow` actors. */
  refId: z.uuid().nullable(),
  /** Display name resolved at read time ("Maya Okafor", "Support triage", "BSurefy support"). */
  name: z.string().nullable(),
})
export type AuditActorDto = z.infer<typeof auditActorDtoSchema>

/** Chain position and signature; `chainSeq`, `chainHash` and `sealedAt` are null until sealed ("Sealing…"). */
export const auditIntegrityDtoSchema = z.object({
  entryHash: sha256HexSchema,
  chainSeq: z.number().int().positive().nullable(),
  chainHash: sha256HexSchema.nullable(),
  sealedAt: z.iso.datetime().nullable(),
})
export type AuditIntegrityDto = z.infer<typeof auditIntegrityDtoSchema>

export const auditEntryDtoSchema = z.object({
  id: z.uuid(),
  actor: auditActorDtoSchema,
  via: z.enum(AUDIT_VIAS),
  accessGrantId: z.uuid().nullable(),
  partnerId: z.uuid().nullable(),
  action: auditActionSchema,
  targetType: auditTargetTypeSchema,
  targetId: z.uuid().nullable(),
  /** Display label of the target resolved at read time; null when organization-wide or gone. */
  targetLabel: z.string().nullable(),
  outcome: z.enum(AUDIT_OUTCOMES),
  metadata: auditMetadataSchema,
  reason: z.string().nullable(),
  modelKey: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  requestId: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  integrity: auditIntegrityDtoSchema,
  createdAt: z.iso.datetime(),
})
export type AuditEntryDto = z.infer<typeof auditEntryDtoSchema>

/** Newest first; `from`/`to` bound `createdAt` (inclusive from, exclusive to). */
export const listAuditEntriesQuerySchema = pageQuery.extend({
  q: searchQuery,
  actorType: multiValueQuery(z.enum(AUDIT_ACTOR_TYPES)),
  actorUserId: z.uuid().optional(),
  action: multiValueQuery(auditActionSchema),
  targetType: auditTargetTypeSchema.optional(),
  targetId: z.uuid().optional(),
  outcome: multiValueQuery(z.enum(AUDIT_OUTCOMES)),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
})
export type ListAuditEntriesQuery = z.infer<typeof listAuditEntriesQuerySchema>

export const auditEntryParamsSchema = orgParamsSchema.extend({ entryId: z.uuid() })
export type AuditEntryParams = z.infer<typeof auditEntryParamsSchema>

export const AUDIT_INTEGRITY_STATES = ['ok', 'mismatch', 'unverified'] as const
export type AuditIntegrityState = (typeof AUDIT_INTEGRITY_STATES)[number]

/** `GET /api/v1/orgs/:orgId/audit/integrity`: the chain head and the last verification. */
export const auditIntegrityStatusDtoSchema = z.object({
  state: z.enum(AUDIT_INTEGRITY_STATES),
  sealedCount: z.number().int().nonnegative(),
  unsealedCount: z.number().int().nonnegative(),
  lastSealedAt: z.iso.datetime().nullable(),
  lastVerifiedAt: z.iso.datetime().nullable(),
  /** First entry whose hash does not match, when `state` is `mismatch`. */
  mismatch: z.object({ entryId: z.uuid(), chainSeq: z.number().int().positive() }).nullable(),
  /** Enterprise signed checkpoints (`compliance-reports`); null otherwise. */
  lastSignedCheckpointAt: z.iso.datetime().nullable(),
})
export type AuditIntegrityStatusDto = z.infer<typeof auditIntegrityStatusDtoSchema>
