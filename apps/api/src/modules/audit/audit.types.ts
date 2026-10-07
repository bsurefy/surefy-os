// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AuditAction,
  AuditMetadata,
  AuditOutcome,
  AuditTargetType,
  UserRefDto,
} from '@surefy/contracts'

import type { DbExecutor } from '@/core/database/index.js'
import type { ActorContext } from '@/types/context.js'

/**
 * Who acted and how the request arrived: the fields of a `TenantContext` the audit entry needs.
 * Services pass their context through; a context without `via` is a person (`userId`) or the
 * system.
 */
export interface AuditContext {
  orgId: string
  userId: string | null
  via?: ActorContext['via']
  requestId?: string
  ip?: string
  userAgent?: string
  apiKey?: { id: string }
  grantId?: string
}

/** One audit entry as a module describes it (services.md, §5). */
export interface AuditEntryInput {
  /** `<area>.<verb>`; the identity and organization actions are `AUDIT_ACTIONS` in contracts. */
  action: AuditAction | (string & {})
  target: { type: AuditTargetType | (string & {}); id: string | null }
  /** Never content: no prompts, messages, document text or secrets. */
  metadata?: Omit<AuditMetadata, 'version'>
  outcome?: AuditOutcome
  /** The reason typed in a T2 or T3 dialog. */
  reason?: string | null
  /** An agent or flow acting on its own: overrides the actor type, keeps `via`. */
  actor?: { type: 'agent' | 'flow'; refId: string }
  /** AI decisions. */
  modelKey?: string | null
  confidence?: number | null
}

/** Writes an entry inside the caller's tenant transaction; what other modules depend on. */
export interface AuditRecorder {
  record(tx: DbExecutor, ctx: AuditContext, entry: AuditEntryInput): Promise<void>
}

/** Display data of people (actor names), from the module that owns `users`. */
export interface AuditUserRefs {
  findUserRefs(userIds: readonly string[]): Promise<ReadonlyMap<string, UserRefDto>>
}
