// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

/**
 * The outbox topics and their payloads (database/platform-and-jobs.md, §1). Payloads carry ids
 * only, never content or secrets, and a `version`. Topics join this registry with the module that
 * writes them; `purge_soft_deleted` writes the `*.purged` ones.
 */
const purgedPayload = z.object({ version: z.literal(1), id: z.uuid() })

/** Knowledge rows cascade to their documents: the event lists the documents collected before the delete. */
const knowledgePurgedPayload = purgedPayload.extend({ documentIds: z.array(z.uuid()) })

/** A connection's sign-in expired or was revoked by the app (`connections`). */
const connectionExpiredPayload = z.object({ version: z.literal(1), id: z.uuid() })

/**
 * An approval changed state (`approvals`): created, decided by a person, expired (the timeout
 * rejected or continued) or escalated. Ids only: handlers load the current row. The run and flow
 * modules continue their runs from `approval.decided` and `approval.expired`.
 */
const approvalPayload = z.object({ version: z.literal(1), id: z.uuid() })

/**
 * Guard defaults, a guardrail or a personal-data rule changed (`guard`). Ids only: the handler
 * drops the organization's cached rule set so the next check loads the current one.
 */
const guardRulesChangedPayload = z.object({ version: z.literal(1) })

export const OUTBOX_PAYLOADS = {
  'approval.requested': approvalPayload,
  'approval.decided': approvalPayload,
  'approval.expired': approvalPayload,
  'approval.escalated': approvalPayload,
  'connection.expired': connectionExpiredPayload,
  'guard.rules_changed': guardRulesChangedPayload,
  'chat.purged': purgedPayload,
  'knowledge_base.purged': knowledgePurgedPayload,
  'knowledge_source.purged': knowledgePurgedPayload,
} as const

export type OutboxTopic = keyof typeof OUTBOX_PAYLOADS
export type OutboxPayload<T extends OutboxTopic> = z.infer<(typeof OUTBOX_PAYLOADS)[T]>

export const OUTBOX_TOPICS = Object.keys(OUTBOX_PAYLOADS) as OutboxTopic[]

export const isOutboxTopic = (topic: string): topic is OutboxTopic =>
  Object.hasOwn(OUTBOX_PAYLOADS, topic)
