// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto'

import type { auditLogs } from '@/database/tables/index.js'

// The hash chain (conventions-and-security.md, §7). Pure functions, unit-tested on their own.

/** The columns `entry_hash` covers: every immutable field of the entry, not ip or user agent. */
export type HashedAuditFields = Pick<
  typeof auditLogs.$inferSelect,
  | 'id'
  | 'organizationId'
  | 'createdAt'
  | 'actorType'
  | 'actorUserId'
  | 'actorApiKeyId'
  | 'actorRefId'
  | 'via'
  | 'accessGrantId'
  | 'partnerId'
  | 'action'
  | 'targetType'
  | 'targetId'
  | 'outcome'
  | 'metadata'
  | 'reason'
  | 'modelKey'
  | 'confidence'
  | 'requestId'
>

/** JSON with keys sorted at every depth, so jsonb's key order never changes a hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => compareKeys(a, b))
  const members = entries.map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item))
  return `{${members.join(',')}}`
}

/** Code-unit order, independent of the locale. */
const compareKeys = (a: string, b: string): number => {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * `AuditEntryHash` v1: sha256 of the canonical JSON of the hashed fields, timestamps in UTC ISO.
 * `confidence` is a `real`: it is hashed as the single-precision value the column stores.
 */
export function entryHash(entry: HashedAuditFields): Buffer {
  const canonical = canonicalJson({
    version: 1,
    id: entry.id,
    organization_id: entry.organizationId,
    created_at: entry.createdAt.toISOString(),
    actor_type: entry.actorType,
    actor_user_id: entry.actorUserId,
    actor_api_key_id: entry.actorApiKeyId,
    actor_ref_id: entry.actorRefId,
    via: entry.via,
    access_grant_id: entry.accessGrantId,
    partner_id: entry.partnerId,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    outcome: entry.outcome,
    metadata: entry.metadata,
    reason: entry.reason,
    model_key: entry.modelKey,
    confidence: entry.confidence === null ? null : Math.fround(entry.confidence),
    request_id: entry.requestId,
  })
  return createHash('sha256').update(canonical).digest()
}

/** `sha256(previous chain_hash || int8send(chain_seq) || entry_hash)`, as `audit_seal` computes it. */
export function chainHash(previous: Buffer, seq: number, entry: Buffer): Buffer {
  const seqBytes = Buffer.alloc(8)
  seqBytes.writeBigInt64BE(BigInt(seq))
  return createHash('sha256').update(previous).update(seqBytes).update(entry).digest()
}
