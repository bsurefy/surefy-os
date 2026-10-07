// SPDX-License-Identifier: AGPL-3.0-only
import { orgKey, type Cache } from '@/core/cache/index.js'
import { decodeCursor, toPage } from '@/lib/pagination.js'
import { uuidv7 } from '@/lib/uuidv7.js'
import {
  AUDIT_ACTION_PATTERN,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPE_PATTERN,
  type AuditActorType,
  type AuditEntryDto,
  type AuditIntegrityState,
  type AuditIntegrityStatusDto,
  type AuditVia,
  type ListAuditEntriesQuery,
} from '@surefy/contracts'

import {
  AUDIT_INTEGRITY_TTL_SECONDS,
  AUDIT_SEAL_LIMIT,
  AUDIT_VERIFY_BATCH,
  AUDIT_ZERO_HASH,
} from './audit.constants.js'
import { AuditEntryNotFoundError } from './audit.errors.js'
import { toAuditEntryDto } from './audit.mapper.js'
import { chainHash, entryHash } from './audit.utils.js'

import type { AuditLogRow, AuditRepository } from './audit.repository.js'
import type { AuditContext, AuditEntryInput, AuditRecorder, AuditUserRefs } from './audit.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { ActorContext } from '@/types/context.js'

export interface AuditServiceDeps {
  db: Database
  cache: Cache
  auditRepository: AuditRepository
  users: AuditUserRefs
}

/** The last verification of an organization's chain, kept in the cache. */
interface StoredIntegrity {
  state: Exclude<AuditIntegrityState, 'unverified'>
  verifiedAt: string
  mismatch: { entryId: string; chainSeq: number } | null
}

export interface VerificationResult {
  state: Exclude<AuditIntegrityState, 'unverified'>
  checked: number
  mismatch: { entryId: string; chainSeq: number } | null
}

const ACTOR_TYPES: Record<AuditVia, AuditActorType> = {
  user: 'user',
  'api-key': 'api_key',
  support: 'support',
  partner: 'partner',
  system: 'system',
}

/** Where a verification is in an organization's chain. */
interface ChainWalk {
  previous: Buffer | null
  lastSeq: number
  checked: number
}

/**
 * Checks one sealed row against the walk so far and advances it; false on a mismatch. The oldest
 * retained row anchors a chain whose start retention dropped: its stored `chain_hash` is trusted.
 */
const stepChain = (walk: ChainWalk, row: AuditLogRow): boolean => {
  const seq = row.chainSeq ?? 0
  if (!entryHash(row).equals(row.entryHash)) return false
  const previous = walk.previous ?? (seq === 1 ? AUDIT_ZERO_HASH : null)
  if (previous !== null) {
    if (seq !== walk.lastSeq + 1 || row.chainHash === null) return false
    if (!chainHash(previous, seq, row.entryHash).equals(row.chainHash)) return false
  }
  walk.previous = row.chainHash
  walk.lastSeq = seq
  walk.checked += 1
  return true
}

const integrityKey = (orgId: string) => orgKey(orgId, 'audit', 'integrity')

/** Actor types whose `actor_user_id` is a person with a display name. */
const PERSON_ACTORS = new Set<AuditActorType>(['user', 'support', 'partner'])

/**
 * The append-only, hash-chained audit log (usage-budgets-and-audit.md, §4–5). `record` runs inside
 * the caller's tenant transaction, so a rolled-back change leaves no entry; sealing and
 * verification run in the `maintenance` queue.
 */
export class AuditService implements AuditRecorder {
  constructor(private readonly deps: AuditServiceDeps) {}

  /** Writes one entry in the caller's transaction; the actor and request come from `ctx`. */
  async record(tx: DbExecutor, ctx: AuditContext, entry: AuditEntryInput): Promise<void> {
    if (!AUDIT_ACTION_PATTERN.test(entry.action)) {
      throw new Error(`audit: invalid action ${entry.action}`)
    }
    if (!AUDIT_TARGET_TYPE_PATTERN.test(entry.target.type)) {
      throw new Error(`audit: invalid target type ${entry.target.type}`)
    }
    const via: AuditVia = ctx.via ?? (ctx.userId === null ? 'system' : 'user')
    const createdAt = new Date()
    const fields = {
      id: uuidv7(createdAt.getTime()),
      organizationId: ctx.orgId,
      createdAt,
      actorType: entry.actor?.type ?? ACTOR_TYPES[via],
      actorUserId: ctx.userId,
      actorApiKeyId: ctx.apiKey?.id ?? null,
      actorRefId: entry.actor?.refId ?? null,
      via,
      accessGrantId: via === 'support' || via === 'partner' ? (ctx.grantId ?? null) : null,
      partnerId: null, // Cloud partner actions carry it through cloud-api
      action: entry.action,
      targetType: entry.target.type,
      targetId: entry.target.id,
      outcome: entry.outcome ?? 'success',
      metadata: { ...entry.metadata, version: 1 as const },
      reason: entry.reason ?? null,
      modelKey: entry.modelKey ?? null,
      confidence: entry.confidence ?? null,
      requestId: ctx.requestId ?? null,
    }
    await this.deps.auditRepository.insert(tx, {
      ...fields,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      entryHash: entryHash(fields),
    })
  }

  async list(
    ctx: AuditContext,
    query: ListAuditEntriesQuery,
  ): Promise<{ items: AuditEntryDto[]; nextCursor: string | null }> {
    const { limit, cursor, ...filters } = query
    const { rows, labels } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const page = await this.deps.auditRepository.listPage(tx, ctx.orgId, filters, {
        limit,
        ...(cursor === undefined ? {} : { cursor: decodeCursor(cursor) }),
      })
      const entries = page.slice(0, limit).map((row) => row.entry)
      return { rows: page, labels: await this.targetLabels(tx, ctx.orgId, entries) }
    })
    const { items, nextCursor } = toPage(rows, limit, (row) => ({
      k: row.sortKey,
      id: row.entry.id,
    }))
    const entries = items.map((row) => row.entry)
    const names = await this.actorNames(entries)
    return { items: entries.map((row) => this.toDto(row, names, labels)), nextCursor }
  }

  async get(ctx: AuditContext, entryId: string): Promise<AuditEntryDto> {
    const { row, labels } = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const found = await this.deps.auditRepository.findById(tx, ctx.orgId, entryId)
      if (found === undefined) throw new AuditEntryNotFoundError()
      return { row: found, labels: await this.targetLabels(tx, ctx.orgId, [found]) }
    })
    return this.toDto(row, await this.actorNames([row]), labels)
  }

  /** The chain head, the counts and the last verification (Guard › Audit log). */
  async integrity(ctx: AuditContext): Promise<AuditIntegrityStatusDto> {
    const { head, counts } = await this.deps.db.tenant(ctx.orgId, async (tx) => ({
      head: await this.deps.auditRepository.findChainHead(tx, ctx.orgId),
      counts: await this.deps.auditRepository.counts(tx, ctx.orgId),
    }))
    const stored = await this.deps.cache.get<StoredIntegrity>(integrityKey(ctx.orgId))
    return {
      state: stored?.state ?? 'unverified',
      sealedCount: counts.sealed,
      unsealedCount: counts.unsealed,
      lastSealedAt: head?.lastSealedAt?.toISOString() ?? null,
      lastVerifiedAt: stored?.verifiedAt ?? null,
      mismatch: stored?.mismatch ?? null,
      lastSignedCheckpointAt: null, // Enterprise signed checkpoints (`compliance-reports`)
    }
  }

  /**
   * Install-wide changes have no organization of their own: the entry goes to the acting
   * person's last organization when they are an active member there (organizations-and-members.md,
   * §10), with `target_type = 'install'` or the administrator concerned. Returns false when the
   * person has no such organization and nothing was written.
   */
  async recordInLastOrganization(actor: ActorContext, entry: AuditEntryInput): Promise<boolean> {
    const { userId } = actor
    if (userId === null) return false
    const orgId = await this.deps.db.user(userId, async (tx) => {
      const last = await this.deps.auditRepository.findLastOrganizationId(tx, userId)
      if (last === null) return null
      return (await this.deps.auditRepository.isActiveMember(tx, last, userId)) ? last : null
    })
    if (orgId === null) return false
    await this.deps.db.tenant(orgId, (tx) => this.record(tx, { ...actor, orgId }, entry))
    return true
  }

  // ---- Maintenance (jobs) ------------------------------------------------------------------

  /** Seals new rows of every organization (`audit_seal`); returns how many. */
  sealPending(): Promise<number> {
    return this.deps.db.system('maintenance', (tx) =>
      this.deps.auditRepository.seal(tx, AUDIT_SEAL_LIMIT),
    )
  }

  /** Organizations that have a chain, for the nightly verification. */
  listChainOrganizations(): Promise<string[]> {
    return this.deps.db.system('maintenance', (tx) =>
      this.deps.auditRepository.listChainOrganizationIds(tx),
    )
  }

  /**
   * Walks the organization's chain by `chain_seq`: recomputes each `entry_hash` and `chain_hash`,
   * then compares the end with the chain head. The oldest retained row anchors the walk when
   * retention dropped the start. Stores the result for the integrity status; with a requester,
   * the verification itself is audited.
   */
  async verify(
    orgId: string,
    requestedByUserId: string | null = null,
  ): Promise<VerificationResult> {
    const result = await this.walkChain(orgId)
    const stored: StoredIntegrity = {
      state: result.state,
      verifiedAt: new Date().toISOString(),
      mismatch: result.mismatch,
    }
    await this.deps.cache.set(integrityKey(orgId), stored, AUDIT_INTEGRITY_TTL_SECONDS)
    if (requestedByUserId !== null) {
      await this.deps.db.tenant(orgId, (tx) =>
        this.record(
          tx,
          { orgId, userId: requestedByUserId },
          {
            action: AUDIT_ACTIONS.AUDIT_VERIFIED,
            target: { type: 'audit_log', id: null },
            outcome: result.state === 'ok' ? 'success' : 'failed',
            metadata: { counts: { checked: result.checked }, codes: [result.state] },
          },
        ),
      )
    }
    return result
  }

  // ---- Private ------------------------------------------------------------------------------

  private async walkChain(orgId: string): Promise<VerificationResult> {
    const walk: ChainWalk = { previous: null, lastSeq: 0, checked: 0 }
    for (;;) {
      const rows = await this.deps.db.tenant(orgId, (tx) =>
        this.deps.auditRepository.listSealedAfter(tx, orgId, walk.lastSeq, AUDIT_VERIFY_BATCH),
      )
      for (const row of rows) {
        if (!stepChain(walk, row)) {
          return {
            state: 'mismatch',
            checked: walk.checked,
            mismatch: { entryId: row.id, chainSeq: row.chainSeq ?? 0 },
          }
        }
      }
      if (rows.length < AUDIT_VERIFY_BATCH) break
    }
    const head = await this.deps.db.tenant(orgId, (tx) =>
      this.deps.auditRepository.findChainHead(tx, orgId),
    )
    const matches =
      head === undefined
        ? walk.checked === 0
        : head.lastSeq === walk.lastSeq &&
          (walk.checked === 0 || walk.previous?.equals(head.lastHash) === true)
    return { state: matches ? 'ok' : 'mismatch', checked: walk.checked, mismatch: null }
  }

  private async actorNames(rows: readonly AuditLogRow[]): Promise<ReadonlyMap<string, string>> {
    const ids = rows.flatMap((row) =>
      PERSON_ACTORS.has(row.actorType) && row.actorUserId !== null ? [row.actorUserId] : [],
    )
    const targetUserIds = rows.flatMap((row) =>
      row.targetType === 'user' && row.targetId !== null ? [row.targetId] : [],
    )
    const refs = await this.deps.users.findUserRefs([...new Set([...ids, ...targetUserIds])])
    return new Map([...refs].map(([id, ref]) => [id, ref.name]))
  }

  private targetLabels(
    tx: DbExecutor,
    orgId: string,
    rows: readonly AuditLogRow[],
  ): Promise<Map<string, string>> {
    const targets = rows.flatMap((row) =>
      row.targetId === null ? [] : [{ type: row.targetType, id: row.targetId }],
    )
    return this.deps.auditRepository.findTargetLabels(tx, orgId, targets)
  }

  private toDto(
    row: AuditLogRow,
    names: ReadonlyMap<string, string>,
    labels: ReadonlyMap<string, string>,
  ): AuditEntryDto {
    const actorName =
      PERSON_ACTORS.has(row.actorType) && row.actorUserId !== null
        ? (names.get(row.actorUserId) ?? null)
        : null
    let targetLabel: string | null = null
    if (row.targetId !== null) {
      targetLabel =
        row.targetType === 'user'
          ? (names.get(row.targetId) ?? null)
          : (labels.get(`${row.targetType}:${row.targetId}`) ?? null)
    }
    return toAuditEntryDto(row, { actorName, targetLabel })
  }
}
