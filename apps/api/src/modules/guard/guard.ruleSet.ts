// SPDX-License-Identifier: AGPL-3.0-only
import { GUARD_DEFAULTS } from '@surefy/contracts'
import type {
  GuardQuickApproveRisk,
  GuardrailDefinition,
  GuardrailScope,
  GuardrailType,
  PiiAction,
  PiiScope,
  PiiType,
} from '@surefy/contracts'

import { RULES_CACHE_TTL_SECONDS, rulesCacheKey } from './guard.constants.js'

import type {
  GuardrailRow,
  GuardRepository,
  GuardSettingsRow,
  PiiRuleRow,
} from './guard.repository.js'
import type { Cache } from '@/core/cache/index.js'
import type { Database } from '@/core/database/index.js'

/** The organization's Guard defaults with the defaults filled in. */
export interface GuardSettingsValues {
  autoBp: number
  reviewBp: number
  quickApproveMaxAmountMicros: number
  quickApproveMaxRisk: GuardQuickApproveRisk
  stepUpAmountMicros: number | null
  targetDecisionMinutes: number
  currency: string
}

/** An enabled guardrail as a check reads it. */
export interface StoredGuardrail {
  id: string
  name: string
  type: GuardrailType
  scope: GuardrailScope
  teamId: string | null
  definition: GuardrailDefinition
}

/** A personal-data rule as the filter reads it. */
export interface StoredPiiRule {
  id: string
  piiType: PiiType
  customLabel: string | null
  customPattern: string | null
  action: PiiAction
  scope: PiiScope
  teamId: string | null
  agentId: string | null
}

/** Everything a check or the data filter evaluates for one organization. */
export interface GuardRuleSet {
  settings: GuardSettingsValues
  guardrails: StoredGuardrail[]
  piiRules: StoredPiiRule[]
}

/** The saved row, or the defaults for an organization that has not saved its own. */
export function settingsOf(
  row: GuardSettingsRow | undefined,
  currency: string,
): GuardSettingsValues {
  if (row === undefined) {
    return {
      autoBp: GUARD_DEFAULTS.autoThresholdBp,
      reviewBp: GUARD_DEFAULTS.reviewThresholdBp,
      quickApproveMaxAmountMicros: GUARD_DEFAULTS.quickApproveMaxAmountMicros,
      quickApproveMaxRisk: GUARD_DEFAULTS.quickApproveMaxRisk,
      stepUpAmountMicros: GUARD_DEFAULTS.stepUpAmountMicros,
      targetDecisionMinutes: GUARD_DEFAULTS.targetDecisionMinutes,
      currency,
    }
  }
  return {
    autoBp: row.autoThresholdBp,
    reviewBp: row.reviewThresholdBp,
    quickApproveMaxAmountMicros: row.quickApproveMaxAmountMicros,
    quickApproveMaxRisk: row.quickApproveMaxRisk,
    stepUpAmountMicros: row.stepUpAmountMicros,
    targetDecisionMinutes: row.targetDecisionMinutes,
    currency: row.currency,
  }
}

export const toStoredGuardrail = (row: GuardrailRow): StoredGuardrail => ({
  id: row.id,
  name: row.name,
  type: row.type,
  scope: row.scope,
  teamId: row.teamId,
  definition: row.definition,
})

export const toStoredPiiRule = (row: PiiRuleRow): StoredPiiRule => ({
  id: row.id,
  piiType: row.piiType,
  customLabel: row.customLabel,
  customPattern: row.customPattern,
  action: row.action,
  scope: row.scope,
  teamId: row.teamId,
  agentId: row.agentId,
})

export interface GuardRuleSetsDeps {
  db: Database
  cache: Cache
  repository: GuardRepository
}

/**
 * The active rule set per organization, cached under `org:{orgId}:guard:rules`
 * (database/guard-and-approvals.md, §2). Every write to the settings, the guardrails or the data
 * filters drops the key, directly after the commit and again from the `guard.rules_changed`
 * event, so a check never evaluates rules older than the last change for longer than a relay.
 */
export class GuardRuleSets {
  constructor(private readonly deps: GuardRuleSetsDeps) {}

  get(orgId: string): Promise<GuardRuleSet> {
    return this.deps.cache.wrap(rulesCacheKey(orgId), RULES_CACHE_TTL_SECONDS, () =>
      this.deps.db.tenant(orgId, (tx) => this.load(tx, orgId)),
    )
  }

  async load(
    tx: Parameters<GuardRepository['findSettings']>[0],
    orgId: string,
  ): Promise<GuardRuleSet> {
    const [settings, currency, guardrails, piiRules] = await Promise.all([
      this.deps.repository.findSettings(tx, orgId),
      this.deps.repository.organizationCurrency(tx, orgId),
      this.deps.repository.listEnabledGuardrails(tx, orgId),
      this.deps.repository.listPiiRules(tx, orgId),
    ])
    return {
      settings: settingsOf(settings, currency),
      guardrails: guardrails.map(toStoredGuardrail),
      piiRules: piiRules.map(toStoredPiiRule),
    }
  }

  invalidate(orgId: string): Promise<void> {
    return this.deps.cache.del(rulesCacheKey(orgId))
  }
}
