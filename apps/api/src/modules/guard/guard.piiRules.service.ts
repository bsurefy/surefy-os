// SPDX-License-Identifier: AGPL-3.0-only
import { ServiceUnavailableError, UnprocessableError } from '@/core/errors/index.js'
import { MlInputError, MlTimeoutError, MlUnavailableError } from '@/integrations/ml/index.js'
import {
  BUILT_IN_PII_TYPES,
  ERROR_CODES,
  GUARD_AUDIT_ACTIONS,
  PII_FILTER_DEFAULTS,
  piiActionLoosened,
} from '@surefy/contracts'
import type {
  CreatePiiRuleInput,
  DataFilterTypeDto,
  DataFiltersDto,
  PiiAction,
  PiiRuleDto,
  TestDataFilterInput,
  TestDataFilterResultDto,
  UpdatePiiRuleInput,
} from '@surefy/contracts'

import { NIL_UUID } from './guard.constants.js'
import {
  GuardPiiPatternInvalidError,
  GuardPiiRuleDuplicateError,
  GuardPiiRuleNotFoundError,
  GuardReasonRequiredError,
} from './guard.errors.js'
import { customKey, mlTypesOf, organizationAction, resolvePiiRules, tally } from './guard.pii.js'
import { customPatternProblem } from './guard.piiPattern.js'
import { toPiiRuleDto } from './guard.presenter.js'
import { toStoredPiiRule } from './guard.ruleSet.js'

import type { PiiFilterFinding } from './guard.pii.js'
import type { GuardRefs, GuardRefsLoader } from './guard.presenter.js'
import type { GuardRepository, PiiRuleRow } from './guard.repository.js'
import type { GuardRuleSets, StoredPiiRule } from './guard.ruleSet.js'
import type { GuardContext, GuardOutbox, GuardPiiService, GuardTeams } from './guard.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface PiiRulesServiceDeps {
  db: Database
  repository: GuardRepository
  ruleSets: GuardRuleSets
  refs: GuardRefsLoader
  teams: GuardTeams
  ml: GuardPiiService
  audit: AuditRecorder
  outbox: GuardOutbox
}

const UNIQUE_VIOLATION = '23505'

const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error
  while (typeof current === 'object' && current !== null) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** The organization's row for the type the input is about (a custom type by label). */
function organizationRowOf(rows: readonly PiiRuleRow[], input: CreatePiiRuleInput) {
  return rows.find(
    (row) =>
      row.scope === 'organization' &&
      row.piiType === input.piiType &&
      (input.piiType !== 'custom' ||
        customKey(row.customLabel ?? '') === customKey(input.customLabel ?? '')),
  )
}

/** An exception is always T2; an organization row is T2 when it is looser than what applied. */
function createLoosens(rows: readonly PiiRuleRow[], input: CreatePiiRuleInput): boolean {
  if (input.scope !== 'organization') return true
  if (input.piiType === 'custom') return false
  return piiActionLoosened(
    organizationAction(rows.map(toStoredPiiRule), input.piiType),
    input.action,
  )
}

function piiChanges(before: PiiRuleRow, after: PiiRuleRow) {
  const pairs: [string, unknown, unknown][] = [
    ['action', before.action, after.action],
    ['customLabel', before.customLabel, after.customLabel],
    ['customPattern', before.customPattern, after.customPattern],
  ]
  return pairs
    .filter(([, from, to]) => from !== to)
    .map(([field, from, to]) => ({ field, from, to }))
}

/** The organization's rules with a pattern being edited in place of the saved one (or added, masking). */
function withTrialPattern(
  rules: readonly StoredPiiRule[],
  label: string,
  pattern: string,
): StoredPiiRule[] {
  const key = customKey(label)
  const isTrialed = (rule: StoredPiiRule) =>
    rule.piiType === 'custom' &&
    rule.scope === 'organization' &&
    customKey(rule.customLabel ?? '') === key
  const existing = rules.find(isTrialed)
  const trial: StoredPiiRule = {
    id: existing?.id ?? NIL_UUID,
    piiType: 'custom',
    customLabel: label,
    customPattern: pattern,
    action: existing?.action ?? 'mask',
    scope: 'organization',
    teamId: null,
    agentId: null,
  }
  return [...rules.filter((rule) => !isTrialed(rule)), trial]
}

const invalid = (field: string, message: string) =>
  new UnprocessableError(ERROR_CODES.VALIDATION_FAILED, message, { details: [{ field }] })

/**
 * The personal-data rules (database/guard-and-approvals.md, §3; Guard › Data filters): the
 * organization's action per type, team and agent exceptions, and the live "Try it". Loosening a
 * type, adding an exception or removing a stricter rule is T2 and needs a reason.
 */
export class PiiRulesService {
  constructor(private readonly deps: PiiRulesServiceDeps) {}

  /** Every built-in type with its action, and the custom types, each with its exceptions. */
  async list(ctx: GuardContext): Promise<DataFiltersDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const rows = await this.deps.repository.listPiiRules(tx, ctx.orgId)
      const refs = await this.loadRefs(tx, ctx.orgId, rows)
      const dtos = new Map(rows.map((row) => [row.id, toPiiRuleDto(row, refs)]))
      const exceptionsOf = (matches: (row: PiiRuleRow) => boolean): PiiRuleDto[] =>
        rows
          .filter((row) => row.scope !== 'organization' && matches(row))
          .flatMap((row) => dtos.get(row.id) ?? [])
      const items: DataFilterTypeDto[] = BUILT_IN_PII_TYPES.map((type) => {
        const org = rows.find((row) => row.scope === 'organization' && row.piiType === type)
        return {
          piiType: type,
          customLabel: null,
          customPattern: null,
          action: org?.action ?? PII_FILTER_DEFAULTS[type],
          source: org === undefined ? ('default' as const) : ('organization' as const),
          ruleId: org?.id ?? null,
          exceptions: exceptionsOf((row) => row.piiType === type),
        }
      })
      for (const org of rows.filter(
        (row) => row.scope === 'organization' && row.piiType === 'custom',
      )) {
        const key = customKey(org.customLabel ?? '')
        items.push({
          piiType: 'custom',
          customLabel: org.customLabel,
          customPattern: org.customPattern,
          action: org.action,
          source: 'organization',
          ruleId: org.id,
          exceptions: exceptionsOf(
            (row) => row.piiType === 'custom' && customKey(row.customLabel ?? '') === key,
          ),
        })
      }
      return { items }
    })
  }

  async create(ctx: GuardContext, input: CreatePiiRuleInput): Promise<PiiRuleDto> {
    if (input.customPattern !== undefined) this.assertPattern(input.customPattern)
    const dto = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (input.teamId !== undefined) await this.assertTeam(tx, ctx.orgId, input.teamId)
      const rows = await this.deps.repository.listPiiRules(tx, ctx.orgId)
      const organization = organizationRowOf(rows, input)
      if (
        input.scope !== 'organization' &&
        input.piiType === 'custom' &&
        organization === undefined
      ) {
        throw invalid(
          'piiType',
          'An exception needs the organization to define the custom type first',
        )
      }
      if (createLoosens(rows, input) && input.reason === undefined) {
        throw new GuardReasonRequiredError()
      }
      let row: PiiRuleRow
      try {
        row = await this.deps.repository.insertPiiRule(tx, {
          organizationId: ctx.orgId,
          piiType: input.piiType,
          // an exception carries the organization's label and pattern, so they change together
          customLabel: organization?.customLabel ?? input.customLabel ?? null,
          customPattern: organization?.customPattern ?? input.customPattern ?? null,
          action: input.action,
          scope: input.scope,
          teamId: input.teamId ?? null,
          agentId: input.agentId ?? null,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new GuardPiiRuleDuplicateError()
        throw error
      }
      await this.deps.audit.record(tx, ctx, {
        action: GUARD_AUDIT_ACTIONS.PII_RULE_CREATED,
        target: { type: 'pii_rule', id: row.id },
        metadata: { labels: this.labelsOf(row) },
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      })
      await this.writeRulesChanged(tx, ctx)
      return toPiiRuleDto(row, await this.loadRefs(tx, ctx.orgId, [row]))
    })
    await this.afterRulesChanged(ctx.orgId)
    return dto
  }

  /** The action, and a custom type's label and pattern. A looser action needs a reason. */
  async update(ctx: GuardContext, ruleId: string, input: UpdatePiiRuleInput): Promise<PiiRuleDto> {
    if (input.customPattern !== undefined) this.assertPattern(input.customPattern)
    const dto = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, ruleId)
      const changesCustom = input.customLabel !== undefined || input.customPattern !== undefined
      if (current.piiType !== 'custom' && changesCustom) {
        throw invalid('customPattern', 'Only a custom type has a label and a pattern')
      }
      const loosened = input.action !== undefined && piiActionLoosened(current.action, input.action)
      if (loosened && input.reason === undefined) throw new GuardReasonRequiredError()
      let row: PiiRuleRow
      try {
        row =
          (await this.deps.repository.updatePiiRule(tx, ctx.orgId, ruleId, {
            ...(input.action === undefined ? {} : { action: input.action }),
            ...(input.customLabel === undefined ? {} : { customLabel: input.customLabel }),
            ...(input.customPattern === undefined ? {} : { customPattern: input.customPattern }),
            updatedByUserId: ctx.userId,
          })) ?? current
        // the exceptions of a custom type follow its label and pattern
        if (current.piiType === 'custom' && current.scope === 'organization') {
          await this.syncExceptions(tx, ctx, current, row)
        }
      } catch (error) {
        if (isUniqueViolation(error)) throw new GuardPiiRuleDuplicateError()
        throw error
      }
      await this.deps.audit.record(tx, ctx, {
        action: GUARD_AUDIT_ACTIONS.PII_RULE_UPDATED,
        target: { type: 'pii_rule', id: ruleId },
        metadata: {
          changes: piiChanges(current, row),
          labels: this.labelsOf(row),
        },
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      })
      await this.writeRulesChanged(tx, ctx)
      return toPiiRuleDto(row, await this.loadRefs(tx, ctx.orgId, [row]))
    })
    await this.afterRulesChanged(ctx.orgId)
    return dto
  }

  /**
   * Falls back to the next level: an exception goes and the organization row stays, an
   * organization row goes and the code default applies. Needs a reason when that lets more through.
   */
  async delete(ctx: GuardContext, ruleId: string, reason: string | undefined): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findOrThrow(tx, ctx.orgId, ruleId)
      const rows = await this.deps.repository.listPiiRules(tx, ctx.orgId)
      const stored = rows.map(toStoredPiiRule)
      let fallback: PiiAction
      if (current.piiType === 'custom') {
        // removing the organization's custom type ends its filtering; an exception falls back to it
        const org = rows.find(
          (row) =>
            row.scope === 'organization' &&
            row.piiType === 'custom' &&
            customKey(row.customLabel ?? '') === customKey(current.customLabel ?? ''),
        )
        fallback = current.scope === 'organization' ? 'detect' : (org?.action ?? 'detect')
      } else {
        fallback =
          current.scope === 'organization'
            ? PII_FILTER_DEFAULTS[current.piiType]
            : organizationAction(stored, current.piiType)
      }
      if (piiActionLoosened(current.action, fallback) && reason === undefined) {
        throw new GuardReasonRequiredError()
      }
      const removed =
        current.piiType === 'custom' && current.scope === 'organization'
          ? rows.filter(
              (row) =>
                row.piiType === 'custom' &&
                customKey(row.customLabel ?? '') === customKey(current.customLabel ?? ''),
            )
          : [current]
      for (const row of removed) await this.deps.repository.deletePiiRule(tx, ctx.orgId, row.id)
      await this.deps.audit.record(tx, ctx, {
        action: GUARD_AUDIT_ACTIONS.PII_RULE_DELETED,
        target: { type: 'pii_rule', id: ruleId },
        metadata: { labels: this.labelsOf(current), counts: { removed: removed.length } },
        ...(reason === undefined ? {} : { reason }),
      })
      await this.writeRulesChanged(tx, ctx)
    })
    await this.afterRulesChanged(ctx.orgId)
  }

  /**
   * "Try it": the text as the organization's rules (or a team's or an agent's exceptions) would
   * treat it. A pattern being edited is tried before it is saved.
   */
  async test(ctx: GuardContext, input: TestDataFilterInput): Promise<TestDataFilterResultDto> {
    if (input.customPattern !== undefined) this.assertPattern(input.customPattern)
    const rules = await this.deps.ruleSets.get(ctx.orgId)
    const stored =
      input.customPattern !== undefined && input.customLabel !== undefined
        ? withTrialPattern(rules.piiRules, input.customLabel, input.customPattern)
        : rules.piiRules
    const resolved = resolvePiiRules(stored, {
      teamIds: input.teamId === undefined ? [] : [input.teamId],
      agentId: input.agentId ?? null,
    })
    const request = {
      orgId: ctx.orgId,
      texts: [input.text],
      ...mlTypesOf(resolved),
      ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
    }
    try {
      const detected = await this.deps.ml.detectPii(request)
      const byKey = new Map(resolved.map((rule) => [rule.key, rule]))
      const counts = new Map<string, PiiFilterFinding>()
      for (const finding of detected.results[0]?.findings ?? []) tally(counts, byKey, finding)
      const findings = [...counts.values()]
      let maskedText = input.text
      if (findings.some((finding) => finding.action === 'mask')) {
        const masked = await this.deps.ml.maskPii({
          ...request,
          ...mlTypesOf(resolved.filter((rule) => rule.action === 'mask')),
        })
        maskedText = masked.results[0]?.text ?? input.text
      }
      return {
        maskedText,
        blocked: findings.some((finding) => finding.action === 'block'),
        findings,
      }
    } catch (error) {
      if (error instanceof MlInputError) throw new GuardPiiPatternInvalidError(error.message)
      if (error instanceof MlUnavailableError || error instanceof MlTimeoutError) {
        throw new ServiceUnavailableError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          'The data filter service is not available right now',
          { cause: error },
        )
      }
      throw error
    }
  }

  // ---- Private ------------------------------------------------------------------------------

  private assertPattern(pattern: string): void {
    const problem = customPatternProblem(pattern)
    if (problem !== null) throw new GuardPiiPatternInvalidError(problem)
  }

  private async findOrThrow(tx: DbExecutor, orgId: string, ruleId: string): Promise<PiiRuleRow> {
    const row = await this.deps.repository.findPiiRule(tx, orgId, ruleId)
    if (row === undefined) throw new GuardPiiRuleNotFoundError()
    return row
  }

  private async assertTeam(tx: DbExecutor, orgId: string, teamId: string): Promise<void> {
    const [team] = await this.deps.teams.findRefsInTx(tx, orgId, [teamId])
    if (team === undefined) throw invalid('teamId', 'The team does not exist')
  }

  private loadRefs(tx: DbExecutor, orgId: string, rows: readonly PiiRuleRow[]): Promise<GuardRefs> {
    return this.deps.refs.load(tx, orgId, {
      userIds: rows.flatMap((row) => [row.createdByUserId, row.updatedByUserId]),
      teamIds: rows.map((row) => row.teamId),
      agentIds: rows.map((row) => row.agentId),
    })
  }

  private labelsOf(row: PiiRuleRow) {
    return {
      piiType: row.piiType,
      customLabel: row.customLabel,
      action: row.action,
      scope: row.scope,
    }
  }

  /** The exceptions of a custom type carry its label and pattern, so they follow when it changes. */
  private async syncExceptions(
    tx: DbExecutor,
    ctx: GuardContext,
    before: PiiRuleRow,
    after: PiiRuleRow,
  ): Promise<void> {
    if (before.customLabel === after.customLabel && before.customPattern === after.customPattern)
      return
    const rows = await this.deps.repository.listPiiRules(tx, ctx.orgId)
    for (const row of rows) {
      if (
        row.scope !== 'organization' &&
        row.piiType === 'custom' &&
        customKey(row.customLabel ?? '') === customKey(before.customLabel ?? '')
      ) {
        await this.deps.repository.updatePiiRule(tx, ctx.orgId, row.id, {
          customLabel: after.customLabel,
          customPattern: after.customPattern,
          updatedByUserId: ctx.userId,
        })
      }
    }
  }

  private async writeRulesChanged(tx: DbExecutor, ctx: GuardContext): Promise<void> {
    await this.deps.outbox.write(tx, {
      orgId: ctx.orgId,
      topic: 'guard.rules_changed',
      payload: { version: 1 },
      ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
    })
  }

  private async afterRulesChanged(orgId: string): Promise<void> {
    await this.deps.ruleSets.invalidate(orgId)
    await this.deps.outbox.kick()
  }
}
