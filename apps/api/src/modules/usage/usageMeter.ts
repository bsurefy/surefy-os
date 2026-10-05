// SPDX-License-Identifier: AGPL-3.0-only
import { uuidv7 } from '@/lib/uuidv7.js'
import {
  usageEventSchema,
  type ModelCallCredentialScope,
  type UsageBilledVia,
  type UsageDataLocation,
  type UsageEvent,
} from '@surefy/contracts'

import { SOURCE_MODULE_OF_CALLER } from './usage.types.js'

import type { UsageRepository } from './usage.repository.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { ModelCallRecord, UsageRecorder } from '@/modules/modelGateway/index.js'

export interface UsageMeterDeps {
  db: Database
  repository: UsageRepository
  logger: Logger
}

const BILLED_VIA: Record<ModelCallCredentialScope, UsageBilledVia> = {
  organization: 'provider_direct',
  team: 'provider_direct',
  personal: 'provider_direct',
  local: 'local',
  platform: 'platform_credits',
}

const DATA_LOCATION: Record<ModelCallCredentialScope, UsageDataLocation> = {
  organization: 'provider',
  team: 'provider',
  personal: 'provider',
  local: 'local',
  platform: 'platform',
}

/** Turns one gateway call into its usage row (usage-budgets-and-audit.md, §1). */
export function eventOfCall(record: ModelCallRecord): UsageEvent {
  const { ctx, result } = record
  const scope = result.credentialScope
  const subject = ctx.meter?.subject ?? null
  const key = ctx.meter?.key ?? `call:${uuidv7()}`
  return {
    userId: ctx.userId,
    teamId: ctx.userId === null ? null : ctx.primaryTeamId,
    apiKeyId: ctx.apiKeyId ?? null,
    sourceModule: SOURCE_MODULE_OF_CALLER[ctx.caller],
    subjectType: subject?.type ?? null,
    subjectId: subject?.id ?? null,
    sourceRefId: ctx.meter?.sourceRefId ?? null,
    kind: record.kind,
    modelKey: result.model.modelKey,
    vaultModelId: record.vaultModelId,
    credentialId: record.credentialId,
    credentialScope: scope,
    providerKey: result.model.providerKey,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedInputTokens: result.usage.cachedInputTokens,
    reasoningTokens: 0,
    units: 0,
    costMicros: scope === 'local' ? 0 : result.usage.costMicros,
    currency: result.usage.currency,
    billedVia: BILLED_VIA[scope],
    latencyMs: result.usage.latencyMs,
    outcome: record.outcome,
    errorCode: record.errorCode,
    routed: result.routed,
    fallbackFromModelKey: result.fallback?.from.modelKey ?? null,
    piiMasked: false,
    dataLocation: DATA_LOCATION[scope],
    dedupeKey: `${key}:${record.attempt}`,
    requestId: ctx.requestId ?? null,
    occurredAt: record.startedAt.toISOString(),
  }
}

/**
 * The meter: every model, embedding, search, speech and training call becomes one append-only
 * `usage_events` row. A retried meter with the same dedupe key and event time records nothing.
 */
export class UsageMeter implements UsageRecorder {
  constructor(private readonly deps: UsageMeterDeps) {}

  /** The model gateway's recorder: its own transaction, after the call. */
  async record(record: ModelCallRecord): Promise<void> {
    await this.deps.db.tenant(record.ctx.orgId, (tx) =>
      this.recordInTx(tx, record.ctx.orgId, eventOfCall(record)),
    )
  }

  /** Inside the caller's tenant transaction (a chat message, a run step); true when inserted. */
  async recordInTx(tx: DbExecutor, orgId: string, event: UsageEvent): Promise<boolean> {
    const parsed = usageEventSchema.safeParse(event)
    if (!parsed.success) {
      // a malformed row is a bug in the caller; the call itself already happened
      this.deps.logger.error(
        { orgId, issues: parsed.error.issues, dedupeKey: event.dedupeKey },
        'usage event rejected',
      )
      return false
    }
    return this.deps.repository.insertEvent(tx, orgId, parsed.data)
  }
}
