// SPDX-License-Identifier: AGPL-3.0-only
import {
  GUARD_AUDIT_ACTIONS,
  GUARD_IMPACT_SAMPLE_SIZE,
  guardBand,
  guardDefaultsLoosened,
} from '@surefy/contracts'
import type {
  AgentGuard,
  GuardImpactPreviewDto,
  GuardImpactPreviewQuery,
  GuardOverviewDto,
  GuardOverviewQuery,
  GuardSettingsDto,
  UpdateGuardSettingsInput,
} from '@surefy/contracts'

import { IMPACT_SAMPLE_LIMIT } from './guard.constants.js'
import {
  GuardLooserThanParentError,
  GuardReasonRequiredError,
  GuardThresholdsInvalidError,
} from './guard.errors.js'
import { toSettingsDto } from './guard.presenter.js'
import { settingsOf } from './guard.ruleSet.js'

import type { GuardRefsLoader } from './guard.presenter.js'
import type { GuardRepository } from './guard.repository.js'
import type { GuardRuleSets, GuardSettingsValues } from './guard.ruleSet.js'
import type { GuardContext, GuardOutbox, GuardSubjects } from './guard.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface GuardSettingsServiceDeps {
  db: Database
  repository: GuardRepository
  ruleSets: GuardRuleSets
  refs: GuardRefsLoader
  subjects: GuardSubjects
  audit: AuditRecorder
  outbox: GuardOutbox
  /** The clock; tests pass a fixed one. */
  now?: () => Date
}

const DAY_MS = 86_400_000
const RANGE_DAYS = { '7d': 7, '30d': 30 } as const

/** Guard › Overview, Defaults and the impact preview (database/guard-and-approvals.md, §1). */
export class GuardSettingsService {
  constructor(private readonly deps: GuardSettingsServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  /** The saved defaults, or what an organization has until it saves its own. */
  async getDefaults(ctx: GuardContext): Promise<GuardSettingsDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.deps.repository.findSettings(tx, ctx.orgId)
      const currency = await this.deps.repository.organizationCurrency(tx, ctx.orgId)
      const refs = await this.deps.refs.load(tx, ctx.orgId, {
        userIds: [row?.updatedByUserId ?? null],
      })
      return toSettingsDto(row, settingsOf(row, currency), refs)
    })
  }

  /**
   * T2: applies to every agent and flow that uses the defaults. Lowering a threshold, raising the
   * quick-approve limit or the step-up amount, or clearing it needs a reason, which goes into the
   * audit entry with the values before and after.
   */
  async updateDefaults(
    ctx: GuardContext,
    input: UpdateGuardSettingsInput,
  ): Promise<GuardSettingsDto> {
    if (input.reviewThresholdBp >= input.autoThresholdBp) throw new GuardThresholdsInvalidError()
    const result = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.deps.repository.findSettings(tx, ctx.orgId)
      const currency = await this.deps.repository.organizationCurrency(tx, ctx.orgId)
      const before = settingsOf(current, currency)
      const after = {
        autoThresholdBp: input.autoThresholdBp,
        reviewThresholdBp: input.reviewThresholdBp,
        quickApproveMaxAmountMicros: input.quickApproveMaxAmountMicros,
        quickApproveMaxRisk: input.quickApproveMaxRisk,
        stepUpAmountMicros: input.stepUpAmountMicros,
        targetDecisionMinutes: input.targetDecisionMinutes,
      }
      const loosened = guardDefaultsLoosened(
        {
          autoThresholdBp: before.autoBp,
          reviewThresholdBp: before.reviewBp,
          quickApproveMaxAmountMicros: before.quickApproveMaxAmountMicros,
          quickApproveMaxRisk: before.quickApproveMaxRisk,
          stepUpAmountMicros: before.stepUpAmountMicros,
          targetDecisionMinutes: before.targetDecisionMinutes,
        },
        after,
      )
      if (loosened && input.reason === undefined) throw new GuardReasonRequiredError()
      const row = await this.deps.repository.upsertSettings(tx, ctx.orgId, {
        ...after,
        currency: before.currency,
        updatedByUserId: ctx.userId,
      })
      await this.deps.audit.record(tx, ctx, {
        action: GUARD_AUDIT_ACTIONS.GUARD_DEFAULTS_CHANGED,
        target: { type: 'guard_settings', id: ctx.orgId },
        metadata: { changes: changesOf(before, after) },
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      })
      await this.deps.outbox.write(tx, {
        orgId: ctx.orgId,
        topic: 'guard.rules_changed',
        payload: { version: 1 },
        ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
      })
      const refs = await this.deps.refs.load(tx, ctx.orgId, { userIds: [row.updatedByUserId] })
      return toSettingsDto(row, settingsOf(row, currency), refs)
    })
    await this.afterRulesChanged(ctx.orgId)
    return result
  }

  /** "With these values, 412 of the last 1,000 actions would have needed a person." */
  async impact(ctx: GuardContext, query: GuardImpactPreviewQuery): Promise<GuardImpactPreviewDto> {
    const confidences = await this.deps.db.tenant(ctx.orgId, (tx) =>
      this.deps.subjects.recentConfidences(tx, ctx.orgId, IMPACT_SAMPLE_LIMIT),
    )
    const sample = confidences.slice(0, GUARD_IMPACT_SAMPLE_SIZE)
    const thresholds = { autoBp: query.autoThresholdBp, reviewBp: query.reviewThresholdBp }
    const counts = { auto: 0, doubleCheck: 0, human: 0 }
    for (const confidence of sample) {
      const band = guardBand(confidence, thresholds)
      if (band === 'auto') counts.auto += 1
      else if (band === 'double_check') counts.doubleCheck += 1
      else counts.human += 1
    }
    return { sampleSize: sample.length, ...counts }
  }

  /**
   * Guard › Overview: how actions were checked in the range, what Guard stopped, and what needs
   * attention. The rollup is at most about an hour old.
   */
  async overview(ctx: GuardContext, query: GuardOverviewQuery): Promise<GuardOverviewDto> {
    const now = this.now()
    const days = RANGE_DAYS[query.range]
    const since = new Date(now.getTime() - (days - 1) * DAY_MS)
    const fromDay = since.toISOString().slice(0, 10)
    const sinceStart = new Date(`${fromDay}T00:00:00.000Z`)
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const orgId = ctx.orgId
      const settings = await this.deps.repository.findSettings(tx, orgId)
      const rules = settingsOf(settings, 'USD')
      // one transaction runs one query at a time
      const totals = await this.deps.repository.totalsSince(tx, orgId, fromDay)
      const medianSeconds = await this.deps.repository.medianDecisionSeconds(tx, orgId, sinceStart)
      const conflicts = await this.deps.repository.conflictSummary(tx, orgId)
      const outdated = await this.deps.subjects.outdatedThresholds(tx, orgId, {
        autoBp: rules.autoBp,
        reviewBp: rules.reviewBp,
      })
      const overdue = await this.deps.repository.overdueApprovals(
        tx,
        orgId,
        new Date(now.getTime() - rules.targetDecisionMinutes * 60_000),
      )
      const attention: GuardOverviewDto['attention'] = []
      if (overdue > 0) {
        attention.push({
          kind: 'approvals_overdue',
          count: overdue,
          target: { type: 'approvals', id: null },
        })
      }
      if (conflicts.count > 0) {
        attention.push({
          kind: 'guardrail_conflict',
          count: conflicts.count,
          target: { type: 'guardrail', id: conflicts.firstId },
        })
      }
      if (outdated.count > 0) {
        attention.push({
          kind: 'agent_thresholds_outdated',
          count: outdated.count,
          target: { type: 'agent', id: outdated.firstAgentId },
        })
      }
      return {
        range: query.range,
        auto: totals.auto,
        doubleChecked: totals.doubleCheck,
        needsPerson: totals.human,
        blockedByLimits: totals.blockedLimit,
        personalDataHidden: totals.piiMasked,
        ranOnLocalModels: totals.local,
        medianMinutesToApprove:
          medianSeconds === null ? null : Math.round((medianSeconds / 60) * 10) / 10,
        attention,
      }
    })
  }

  /**
   * An agent or flow may be stricter than the organization, never looser: its own thresholds
   * cannot sit below the organization's (`GUARD_LOOSER_THAN_PARENT`). Because the merge takes the
   * higher value at run time, a later raise of the organization's applies at once.
   */
  async assertNotLooser(ctx: Pick<GuardContext, 'orgId'>, guard: Pick<AgentGuard, 'thresholds'>) {
    if (guard.thresholds === null) return
    const rules = await this.deps.ruleSets.get(ctx.orgId)
    if (guard.thresholds.autoBp < rules.settings.autoBp) {
      throw new GuardLooserThanParentError('guard.thresholds.autoBp')
    }
    if (guard.thresholds.reviewBp < rules.settings.reviewBp) {
      throw new GuardLooserThanParentError('guard.thresholds.reviewBp')
    }
  }

  /** The organization's defaults, for readiness checks and the agent editor. */
  async organizationThresholds(orgId: string): Promise<{ autoBp: number; reviewBp: number }> {
    const rules = await this.deps.ruleSets.get(orgId)
    return { autoBp: rules.settings.autoBp, reviewBp: rules.settings.reviewBp }
  }

  /** Like `organizationThresholds`, inside the caller's transaction (the agent readiness check). */
  async organizationThresholdsInTx(
    tx: DbExecutor,
    orgId: string,
  ): Promise<{ autoBp: number; reviewBp: number }> {
    const rules = await this.deps.ruleSets.getInTx(tx, orgId)
    return { autoBp: rules.settings.autoBp, reviewBp: rules.settings.reviewBp }
  }

  private async afterRulesChanged(orgId: string): Promise<void> {
    await this.deps.ruleSets.invalidate(orgId)
    await this.deps.outbox.kick()
  }
}

type Values = Pick<
  GuardSettingsValues,
  | 'autoBp'
  | 'reviewBp'
  | 'quickApproveMaxAmountMicros'
  | 'quickApproveMaxRisk'
  | 'stepUpAmountMicros'
  | 'targetDecisionMinutes'
>

function changesOf(
  before: Values,
  after: {
    autoThresholdBp: number
    reviewThresholdBp: number
    quickApproveMaxAmountMicros: number
    quickApproveMaxRisk: string
    stepUpAmountMicros: number | null
    targetDecisionMinutes: number
  },
) {
  const pairs: [string, unknown, unknown][] = [
    ['autoThresholdBp', before.autoBp, after.autoThresholdBp],
    ['reviewThresholdBp', before.reviewBp, after.reviewThresholdBp],
    [
      'quickApproveMaxAmountMicros',
      before.quickApproveMaxAmountMicros,
      after.quickApproveMaxAmountMicros,
    ],
    ['quickApproveMaxRisk', before.quickApproveMaxRisk, after.quickApproveMaxRisk],
    ['stepUpAmountMicros', before.stepUpAmountMicros, after.stepUpAmountMicros],
    ['targetDecisionMinutes', before.targetDecisionMinutes, after.targetDecisionMinutes],
  ]
  return pairs
    .filter(([, from, to]) => from !== to)
    .map(([field, from, to]) => ({ field, from, to }))
}
