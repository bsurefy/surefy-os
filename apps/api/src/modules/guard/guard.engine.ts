// SPDX-License-Identifier: AGPL-3.0-only
import { GUARD_AUDIT_ACTIONS, guardBand, mergeGuardThresholds } from '@surefy/contracts'
import type {
  DoubleCheckResult,
  GuardCheckResult,
  GuardrailDefinition,
  GuardRuleMatch,
  GuardThresholds,
} from '@surefy/contracts'

import { limitDay } from './guard.limits.js'
import { matchHolds } from './guard.matching.js'
import { mergeApprovalRules } from './guard.merge.js'
import { DEFAULT_ESCALATION } from './guard.types.js'

import type { DailyLimit, LimitCounters } from './guard.limits.js'
import type { ApprovalCandidate, MergedApproval, RuleScope } from './guard.merge.js'
import type { GuardRuleSet, StoredGuardrail, GuardRuleSets } from './guard.ruleSet.js'
import type { GuardApprovals, GuardCheckInput, GuardModelDecider } from './guard.types.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

/** What identifies the request a check belongs to. */
export interface GuardCheckContext {
  orgId: string
  requestId?: string
}

export interface GuardEngineDeps {
  db: Database
  ruleSets: GuardRuleSets
  counters: LimitCounters
  approvals: GuardApprovals
  decider: GuardModelDecider
  audit: AuditRecorder
  logger: Logger
  /** The clock; tests pass a fixed one. */
  now?: () => Date
}

type RuleKind = GuardRuleMatch['type']
type ReasonCode = 'GUARD_BLOCKED_ACTION' | 'GUARD_ACTION_LIMIT'
type LimitRule = Extract<GuardrailDefinition, { kind: 'action_limit' }>

/** A rule that matched the action, from any level. */
interface Matched<T> {
  ref: string
  name: string
  scope: RuleScope
  rule: T
}

interface Matches {
  blocked: Matched<null>[]
  limits: Matched<Pick<LimitRule, 'limit' | 'onReached'>>[]
  approvals: Matched<ApprovalCandidate>[]
  overrides: Matched<GuardThresholds>[]
}

/** The agent rule's reference (`agent:{agentId}:v{n}:{ruleId}`), the same one an approval carries. */
export const agentRuleRef = (agent: { id: string; version: number }, ruleId: string): string =>
  `agent:${agent.id}:v${agent.version}:${ruleId}`

const isStoredRef = (ref: string): boolean => !ref.startsWith('agent:')

const MAX_MATCHED_RULES = 50
const DOUBLE_CHECK_INPUT_MAX = 50_000

const DOUBLE_CHECK_QUESTION =
  'An AI agent wants to run the action below. Is it correct, safe, and what the agent was asked ' +
  'to do? Answer true to let it run, false to hold it for a person.'

/** Collects the rules of every level that match this action (organization, teams, agent). */
export function collectMatches(
  guardrails: readonly StoredGuardrail[],
  teamIds: readonly string[],
  input: Pick<GuardCheckInput, 'agent' | 'guard' | 'action'>,
): Matches {
  const matches: Matches = { blocked: [], limits: [], approvals: [], overrides: [] }
  const applies = (rule: StoredGuardrail) =>
    rule.scope === 'organization' || (rule.teamId !== null && teamIds.includes(rule.teamId))
  for (const stored of guardrails.filter(applies)) {
    const definition = stored.definition
    if (!matchHolds(definition.match, input.action)) continue
    const base = { ref: stored.id, name: stored.name, scope: stored.scope }
    switch (definition.kind) {
      case 'blocked_action':
        matches.blocked.push({ ...base, rule: null })
        break
      case 'action_limit':
        matches.limits.push({
          ...base,
          rule: { limit: definition.limit, onReached: definition.onReached },
        })
        break
      case 'approval_rule':
        matches.approvals.push({
          ...base,
          rule: {
            ref: stored.id,
            scope: stored.scope,
            approvers: definition.approvers,
            waitMinutes: definition.waitMinutes,
            onTimeout: definition.onTimeout,
            risk: definition.risk,
          },
        })
        break
      case 'threshold_override':
        matches.overrides.push({
          ...base,
          rule: { autoBp: definition.autoBp, reviewBp: definition.reviewBp },
        })
        break
      case 'content_filter':
        break // applies to content, not to an action
    }
  }
  const { guard, agent, action } = input
  for (const rule of guard.blockedActions) {
    if (matchHolds(rule.match, action)) {
      matches.blocked.push({
        ref: agentRuleRef(agent, rule.id),
        name: `Blocked ${rule.match.action}`,
        scope: 'agent',
        rule: null,
      })
    }
  }
  for (const rule of guard.actionLimits) {
    if (!matchHolds(rule.match, action)) continue
    matches.limits.push({
      ref: agentRuleRef(agent, rule.id),
      name: `Action limit ${rule.match.action}`,
      scope: 'agent',
      rule: { limit: rule.limit, onReached: rule.onReached },
    })
  }
  for (const rule of guard.approvalRules) {
    if (!matchHolds(rule.match, action)) continue
    const ref = agentRuleRef(agent, rule.id)
    matches.approvals.push({
      ref,
      name: `Approval rule ${rule.match.action}`,
      scope: 'agent',
      rule: {
        ref,
        scope: 'agent',
        approvers: rule.approvers,
        waitMinutes: rule.waitMinutes,
        onTimeout: rule.onTimeout,
        risk: rule.risk,
      },
    })
  }
  return matches
}

/** The confidence rule's answer: what the band leads to, and the review when it asked for one. */
interface Banded {
  outcome: 'auto' | 'double_check' | 'human'
  doubleCheck: DoubleCheckResult | null
}

/** What the rules alone decide, before any confidence is looked at. */
type RuleDecision =
  | { kind: 'blocked'; reasonCode: ReasonCode; deciding: readonly string[] }
  | { kind: 'approval'; approval: MergedApproval; deciding: readonly string[] }
  | { kind: 'pass' }

const defaultApproval = (risk: 'low' | 'medium'): MergedApproval => ({
  ruleRef: null,
  assignees: DEFAULT_ESCALATION,
  waitMinutes: null,
  timeoutAction: 'reject',
  risk,
})

/**
 * Guard's checks 2 to 5 of agent-runs.md, §5: blocked actions, action limits, approval rules and
 * the tool's permission. `reached` are the limits already used up; the rest of the rules are the
 * action's matches.
 */
export function decideByRules(
  matches: Matches,
  reached: readonly Matched<Pick<LimitRule, 'limit' | 'onReached'>>[],
  permission: GuardCheckInput['action']['permission'],
): RuleDecision {
  if (matches.blocked.length > 0) {
    return {
      kind: 'blocked',
      reasonCode: 'GUARD_BLOCKED_ACTION',
      deciding: matches.blocked.map((rule) => rule.ref),
    }
  }
  const blocking = reached.filter((limit) => limit.rule.onReached === 'block')
  if (blocking.length > 0) {
    return {
      kind: 'blocked',
      reasonCode: 'GUARD_ACTION_LIMIT',
      deciding: blocking.map((limit) => limit.ref),
    }
  }
  // a limit that asks for approval is an approval rule that names nobody: Admins decide
  const fromLimits: Matched<ApprovalCandidate>[] = reached.map((limit) => ({
    ref: limit.ref,
    name: limit.name,
    scope: limit.scope,
    rule: {
      ref: limit.ref,
      scope: limit.scope,
      approvers: DEFAULT_ESCALATION,
      waitMinutes: null,
      onTimeout: null,
      risk: 'medium',
    },
  }))
  const candidates = [...matches.approvals, ...fromLimits].map((matched) => matched.rule)
  const [first, ...rest] = candidates
  if (first !== undefined) {
    return {
      kind: 'approval',
      approval: mergeApprovalRules([first, ...rest]),
      deciding: [...matches.approvals, ...fromLimits].map((matched) => matched.ref),
    }
  }
  if (permission === 'ask_first') {
    return { kind: 'approval', approval: defaultApproval('low'), deciding: [] }
  }
  return { kind: 'pass' }
}

/**
 * `guard.check` (agent-runs.md, §5): decides whether an action runs on its own, needs an AI
 * double-check, needs a person, or never runs. The order is fixed: blocked actions, action limits,
 * approval rules, the tool's permission, then the confidence rule. Rules from every level apply
 * and the strictest wins (database/guard-and-approvals.md, "How rules merge").
 */
export class GuardEngine {
  private readonly now: () => Date

  constructor(private readonly deps: GuardEngineDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  async check(ctx: GuardCheckContext, input: GuardCheckInput): Promise<GuardCheckResult> {
    const rules = await this.deps.ruleSets.get(ctx.orgId)
    const matches = collectMatches(rules.guardrails, input.teamIds, input)
    const thresholds = effectiveThresholds(rules, matches, input)
    const day = limitDay(this.now())
    const amount = input.action.amountMicros ?? 0

    const reached = await this.reachedLimits(ctx.orgId, matches, day, amount)
    let decision = decideByRules(matches, reached, input.action.permission)
    let banded: Banded | null = null
    if (decision.kind === 'pass') {
      banded = await this.bandOutcome(input, thresholds)
      if (banded.outcome === 'auto' || banded.outcome === 'double_check') {
        // the action runs now: count it against the daily limits, atomically
        const exhausted = await this.reserveDailyLimits(ctx.orgId, matches, day, amount)
        if (exhausted.length > 0) {
          decision = decideByRules(matches, [...reached, ...exhausted], input.action.permission)
          banded = null
        }
      }
    }

    let outcome: GuardCheckResult['outcome']
    let approval: MergedApproval | null = null
    if (decision.kind === 'blocked') {
      outcome = 'blocked'
    } else if (decision.kind === 'approval') {
      outcome = 'human'
      approval = decision.approval
    } else {
      outcome = banded?.outcome ?? 'human'
      // low confidence, or a review that did not agree: the agent's approvers, else Admins
      if (outcome === 'human') approval = defaultApproval('medium')
    }

    const reasonCode = decision.kind === 'blocked' ? decision.reasonCode : null
    const persisted = await this.persist(ctx, input, {
      outcome,
      approval,
      deciding: decision.kind === 'pass' ? [] : decision.deciding,
    })
    return {
      outcome,
      confidence: input.confidence,
      thresholds: { autoBp: thresholds.autoBp, reviewBp: thresholds.reviewBp },
      matchedRules: describeMatches(matches).slice(0, MAX_MATCHED_RULES),
      doubleCheck: banded?.doubleCheck ?? null,
      approvalId: persisted.approvalId,
      reasonCode,
    }
  }

  // ---- Private ------------------------------------------------------------------------------

  /** The matched limits already used up today, or by this action alone. */
  private async reachedLimits(orgId: string, matches: Matches, day: string, amount: number) {
    const reached: Matches['limits'] = []
    for (const matched of matches.limits) {
      const { limit } = matched.rule
      let isReached =
        limit.perActionAmountMicros !== undefined && amount > limit.perActionAmountMicros
      if (
        !isReached &&
        (limit.perDayCount !== undefined || limit.perDayAmountMicros !== undefined)
      ) {
        const used = await this.deps.counters.read(orgId, matched.ref, day)
        isReached =
          (limit.perDayCount !== undefined && used.count + 1 > limit.perDayCount) ||
          (limit.perDayAmountMicros !== undefined &&
            used.amount + amount > limit.perDayAmountMicros)
      }
      if (isReached) reached.push(matched)
    }
    return reached
  }

  /** Counts the action against each daily limit; returns the limits that turned out used up. */
  private async reserveDailyLimits(
    orgId: string,
    matches: Matches,
    day: string,
    amount: number,
  ): Promise<Matches['limits']> {
    const exhausted: Matches['limits'] = []
    for (const matched of matches.limits) {
      const { limit } = matched.rule
      if (limit.perDayCount === undefined && limit.perDayAmountMicros === undefined) continue
      const daily: DailyLimit = {
        perDayCount: limit.perDayCount,
        perDayAmountMicros: limit.perDayAmountMicros,
      }
      const counted = await this.deps.counters.reserve(orgId, matched.ref, day, daily, amount)
      if (!counted) {
        exhausted.push(matched)
        break // the rest are not counted: the action does not run
      }
    }
    return exhausted
  }

  /** Check 6: the confidence rule. A read-only tool runs; no confidence is the lowest one. */
  private async bandOutcome(input: GuardCheckInput, thresholds: GuardThresholds): Promise<Banded> {
    if (input.action.permission === 'read_only') return { outcome: 'auto', doubleCheck: null }
    const band = guardBand(input.confidence ?? 0, thresholds)
    if (band !== 'double_check') return { outcome: band, doubleCheck: null }
    const doubleCheck = await this.review(input)
    // a disagreeing, failed or impossible review is a person's call
    return { outcome: doubleCheck?.agreed === true ? 'double_check' : 'human', doubleCheck }
  }

  private async review(input: GuardCheckInput): Promise<DoubleCheckResult | null> {
    if (input.doubleCheckModelKey === null) return null
    const subject = JSON.stringify({
      action: input.action.name,
      input: input.action.input,
      reasoning: input.reasoning?.map((entry) => entry.text) ?? [],
    }).slice(0, DOUBLE_CHECK_INPUT_MAX)
    try {
      const answer = await this.deps.decider.decide(input.modelContext, {
        modelKey: input.doubleCheckModelKey,
        question: DOUBLE_CHECK_QUESTION,
        input: subject,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      return {
        agreed: answer.value === true,
        confidence: answer.confidence,
        reasoning: answer.reasoning,
      }
    } catch (error) {
      if (input.signal?.aborted === true) throw error
      this.deps.logger.warn({ err: error, agentId: input.agent.id }, 'guard double check failed')
      return null // no decision is never a guess
    }
  }

  /**
   * Writes what the outcome needs in one transaction: the approval, and the `guard.rule_triggered`
   * entries of the stored rules that decided ("Triggered this week").
   */
  private async persist(
    ctx: GuardCheckContext,
    input: GuardCheckInput,
    decided: {
      outcome: GuardCheckResult['outcome']
      approval: MergedApproval | null
      deciding: readonly string[]
    },
  ): Promise<{ approvalId: string | null }> {
    const stored = [...new Set(decided.deciding.filter(isStoredRef))]
    if (decided.approval === null && stored.length === 0) return { approvalId: null }
    const { approval } = decided
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const system = {
        orgId: ctx.orgId,
        userId: input.onBehalfOfUserId ?? null,
        via: 'system' as const,
        teamIds: [],
        access: { permissions: [] },
        ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
      }
      let approvalId: string | null = null
      let created = true
      if (approval !== null) {
        const made = await this.deps.approvals.create(tx, system, {
          kind: 'ai_action',
          title: input.action.title ?? input.action.name,
          payload: {
            version: 1,
            kind: 'ai_action',
            action: { name: input.action.name, input: { ...input.action.input } },
            reasoning: (input.reasoning ?? []).map((entry) => ({ ...entry })),
            sources: (input.sources ?? []).map((source) => ({ ...source })),
            stepRef: { seq: input.seq },
          },
          amountMicros: input.action.amountMicros ?? null,
          ...(input.action.currency === undefined ? {} : { currency: input.action.currency }),
          confidence: input.confidence,
          risk: approval.risk,
          ruleRef: approval.ruleRef,
          dedupeKey: `guard:${input.runId}:${input.seq}`,
          agentId: input.agent.id,
          agentRunId: input.runId,
          waitMinutes: approval.waitMinutes,
          timeoutAction: approval.timeoutAction,
          assignees: approval.assignees,
        })
        approvalId = made.id
        created = made.created
      }
      // a retried check returns its first approval and does not count the rule twice
      if (created) {
        for (const ruleId of stored) {
          await this.deps.audit.record(tx, system, {
            action: GUARD_AUDIT_ACTIONS.GUARD_RULE_TRIGGERED,
            target: { type: 'guardrail', id: ruleId },
            actor: { type: 'agent', refId: input.agent.id },
            metadata: { labels: { action: input.action.name, outcome: decided.outcome } },
          })
        }
      }
      return { approvalId }
    })
  }
}

/** The effective thresholds: the highest of the organization's, every matching override and the agent's. */
export function effectiveThresholds(
  rules: Pick<GuardRuleSet, 'settings'>,
  matches: Pick<Matches, 'overrides'>,
  input: Pick<GuardCheckInput, 'guard'>,
): GuardThresholds {
  const levels: GuardThresholds[] = [
    { autoBp: rules.settings.autoBp, reviewBp: rules.settings.reviewBp },
    ...matches.overrides.map((override) => override.rule),
  ]
  if (input.guard.thresholds !== null) levels.push(input.guard.thresholds)
  return mergeGuardThresholds(levels as [GuardThresholds, ...GuardThresholds[]])
}

const RULE_TYPES = {
  blocked: 'blocked_action',
  limits: 'action_limit',
  approvals: 'approval_rule',
  overrides: 'threshold_override',
} as const satisfies Record<keyof Matches, RuleKind>

function describeMatches(matches: Matches): GuardRuleMatch[] {
  return (Object.keys(RULE_TYPES) as (keyof Matches)[]).flatMap((key) =>
    matches[key].map((matched) => ({ ref: matched.ref, type: RULE_TYPES[key] })),
  )
}
