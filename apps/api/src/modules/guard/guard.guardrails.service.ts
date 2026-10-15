// SPDX-License-Identifier: AGPL-3.0-only
import { UnprocessableError } from '@/core/errors/index.js'
import { decodeCursor } from '@/lib/pagination.js'
import { ERROR_CODES, GUARD_AUDIT_ACTIONS, PERMISSIONS } from '@surefy/contracts'
import type {
  CreateGuardrailInput,
  GuardrailDto,
  GuardrailImpactDto,
  GuardRuleRowDto,
  ListGuardrailsQuery,
  LockGuardrailInput,
  UpdateGuardrailInput,
} from '@surefy/contracts'

import { GUARDRAILS_LISTED_MAX, TRIGGERED_WINDOW_DAYS } from './guard.constants.js'
import {
  GuardReasonRequiredError,
  GuardRuleLockedError,
  GuardRuleNameTakenError,
  GuardRuleNotFoundError,
  GuardRuleTypeImmutableError,
} from './guard.errors.js'
import { guardrailLoosened } from './guard.loosening.js'
import { encodeOffset, toGuardrailDto, toGuardrailRow, toPiiRuleRow } from './guard.presenter.js'

import type { GuardRefsLoader } from './guard.presenter.js'
import type { GuardrailRow, GuardRepository } from './guard.repository.js'
import type { GuardRuleSets } from './guard.ruleSet.js'
import type { GuardContext, GuardOutbox, GuardSubjects, GuardTeams } from './guard.types.js'
import type { Database, DbExecutor } from '@/core/database/index.js'
import type { AuditRecorder } from '@/modules/audit/index.js'

export interface GuardrailsServiceDeps {
  db: Database
  repository: GuardRepository
  ruleSets: GuardRuleSets
  refs: GuardRefsLoader
  teams: GuardTeams
  subjects: GuardSubjects
  audit: AuditRecorder
  outbox: GuardOutbox
  /** The clock; tests pass a fixed one. */
  now?: () => Date
}

const UNIQUE_VIOLATION = '23505'
const DAY_MS = 86_400_000

const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error
  while (typeof current === 'object' && current !== null) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

const holds = (ctx: Pick<GuardContext, 'access'>, permission: string): boolean =>
  (ctx.access.permissions as readonly string[]).includes(permission)

/** A row of the table with what sorting needs. */
interface TableRow {
  row: GuardRuleRowDto
  createdAt: number
}

/**
 * Guardrails (database/guard-and-approvals.md, §2; Guard › Guardrails): organization- and
 * team-scoped rules. Adding or tightening one saves directly; turning off, loosening or deleting
 * one is T2 with a reason. A rule an Owner locked changes only through Owners.
 */
export class GuardrailsService {
  constructor(private readonly deps: GuardrailsServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  /**
   * The table: stored guardrails, the personal-data rules and the agent and flow rules (read-only
   * rows that point to where they are edited). Builders see the rules of the organization and
   * their teams.
   */
  async list(
    ctx: GuardContext,
    query: ListGuardrailsQuery,
  ): Promise<{ items: GuardRuleRowDto[]; nextCursor: string | null }> {
    const since = new Date(this.now().getTime() - TRIGGERED_WINDOW_DAYS * DAY_MS)
    const all = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      // one transaction runs one query at a time
      const rows = await this.deps.repository.listGuardrails(tx, ctx.orgId)
      const piiRows = await this.deps.repository.listPiiRules(tx, ctx.orgId)
      const agentRows = await this.deps.subjects.ruleRows(tx, ctx.orgId)
      const triggered = await this.deps.repository.triggeredCounts(tx, ctx.orgId, since)
      const visible = rows.filter((row) => this.mayRead(ctx, row))
      const usedBy = await this.deps.subjects.usedBy(
        tx,
        ctx.orgId,
        visible.map((row) => row.id),
      )
      const refs = await this.deps.refs.load(tx, ctx.orgId, {
        userIds: visible.map((row) => row.lockedByUserId),
        teamIds: [...visible.map((row) => row.teamId), ...piiRows.map((row) => row.teamId)],
      })
      const table: TableRow[] = [
        ...visible.map((row) => ({
          row: toGuardrailRow(row, refs, usedBy.get(row.id) ?? 0, triggered.get(row.id) ?? 0),
          createdAt: row.createdAt.getTime(),
        })),
        ...piiRows
          .filter(
            (row) =>
              row.scope !== 'team' ||
              holds(ctx, PERMISSIONS.GUARD_MANAGE) ||
              this.inTeams(ctx, row.teamId),
          )
          .map((row) => ({ row: toPiiRuleRow(row, refs), createdAt: row.createdAt.getTime() })),
        ...agentRows.map((row) => ({ row, createdAt: 0 })),
      ]
      return table
    })
    return page(filterRows(all, query), query)
  }

  async get(ctx: GuardContext, guardrailId: string): Promise<GuardrailDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const row = await this.findReadable(tx, ctx, guardrailId)
      return this.present(tx, ctx.orgId, row)
    })
  }

  /** The agents and flows the guardrail applies to, for the T2 dialog ("Affects 3 agents"). */
  async impact(ctx: GuardContext, guardrailId: string): Promise<GuardrailImpactDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      await this.findReadable(tx, ctx, guardrailId)
      return this.deps.subjects.impact(tx, ctx.orgId, guardrailId)
    })
  }

  async create(ctx: GuardContext, input: CreateGuardrailInput): Promise<GuardrailDto> {
    const dto = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      if (input.teamId !== undefined) await this.assertTeam(tx, ctx.orgId, input.teamId)
      let row: GuardrailRow
      try {
        row = await this.deps.repository.insertGuardrail(tx, {
          organizationId: ctx.orgId,
          name: input.name,
          type: input.definition.kind,
          scope: input.scope,
          teamId: input.teamId ?? null,
          definition: input.definition,
          isEnabled: input.isEnabled,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new GuardRuleNameTakenError()
        throw error
      }
      await this.deps.audit.record(tx, ctx, {
        action: GUARD_AUDIT_ACTIONS.GUARDRAIL_CREATED,
        target: { type: 'guardrail', id: row.id },
        metadata: {
          labels: { name: row.name, type: row.type, scope: row.scope, enabled: row.isEnabled },
        },
      })
      await this.writeRulesChanged(tx, ctx)
      return this.present(tx, ctx.orgId, row)
    })
    await this.afterRulesChanged(ctx.orgId)
    return dto
  }

  /**
   * The name, the definition (which keeps its kind) and whether the rule is on. Turning it off
   * or loosening it needs a `reason`, recorded in the audit entry.
   */
  async update(
    ctx: GuardContext,
    guardrailId: string,
    input: UpdateGuardrailInput,
  ): Promise<GuardrailDto> {
    const dto = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findForChange(tx, ctx, guardrailId)
      if (input.definition !== undefined && input.definition.kind !== current.type) {
        throw new GuardRuleTypeImmutableError()
      }
      const { set, changes, loosened, needsReason } = planUpdate(current, input, ctx.userId)
      if (needsReason && input.reason === undefined) throw new GuardReasonRequiredError()
      let row: GuardrailRow
      try {
        row =
          (await this.deps.repository.updateGuardrail(tx, ctx.orgId, guardrailId, set)) ?? current
      } catch (error) {
        if (isUniqueViolation(error)) throw new GuardRuleNameTakenError()
        throw error
      }
      if (changes.length > 0) {
        await this.deps.audit.record(tx, ctx, {
          action: GUARD_AUDIT_ACTIONS.GUARDRAIL_UPDATED,
          target: { type: 'guardrail', id: guardrailId },
          metadata: { changes, labels: { name: row.name, loosened } },
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        })
        await this.writeRulesChanged(tx, ctx)
      }
      return this.present(tx, ctx.orgId, row)
    })
    await this.afterRulesChanged(ctx.orgId)
    return dto
  }

  /** T2: the reason is required while the rule is on; a rule that is off holds nothing back. */
  async delete(ctx: GuardContext, guardrailId: string, reason: string | undefined): Promise<void> {
    await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findForChange(tx, ctx, guardrailId)
      if (current.isEnabled && reason === undefined) throw new GuardReasonRequiredError()
      await this.deps.repository.deleteGuardrail(tx, ctx.orgId, guardrailId)
      await this.deps.audit.record(tx, ctx, {
        action: GUARD_AUDIT_ACTIONS.GUARDRAIL_DELETED,
        target: { type: 'guardrail', id: guardrailId },
        metadata: {
          labels: { name: current.name, type: current.type, enabled: current.isEnabled },
        },
        ...(reason === undefined ? {} : { reason }),
      })
      await this.writeRulesChanged(tx, ctx)
    })
    await this.afterRulesChanged(ctx.orgId)
  }

  /** Owners only (`guard:lock`, checked by the route): the reason is shown next to the lock. */
  async lock(
    ctx: GuardContext,
    guardrailId: string,
    input: LockGuardrailInput,
  ): Promise<GuardrailDto> {
    const dto = await this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findReadable(tx, ctx, guardrailId)
      const row =
        (await this.deps.repository.updateGuardrail(tx, ctx.orgId, guardrailId, {
          isLocked: true,
          lockedByUserId: ctx.userId,
          lockedReason: input.reason,
          updatedByUserId: ctx.userId,
        })) ?? current
      await this.deps.audit.record(tx, ctx, {
        action: GUARD_AUDIT_ACTIONS.GUARDRAIL_LOCKED,
        target: { type: 'guardrail', id: guardrailId },
        metadata: { labels: { name: row.name } },
        reason: input.reason,
      })
      return this.present(tx, ctx.orgId, row)
    })
    return dto
  }

  async unlock(ctx: GuardContext, guardrailId: string): Promise<GuardrailDto> {
    return this.deps.db.tenant(ctx.orgId, async (tx) => {
      const current = await this.findReadable(tx, ctx, guardrailId)
      const row =
        (await this.deps.repository.updateGuardrail(tx, ctx.orgId, guardrailId, {
          isLocked: false,
          lockedByUserId: null,
          lockedReason: null,
          updatedByUserId: ctx.userId,
        })) ?? current
      await this.deps.audit.record(tx, ctx, {
        action: GUARD_AUDIT_ACTIONS.GUARDRAIL_UNLOCKED,
        target: { type: 'guardrail', id: guardrailId },
        metadata: { labels: { name: row.name } },
      })
      return this.present(tx, ctx.orgId, row)
    })
  }

  // ---- Private ------------------------------------------------------------------------------

  private inTeams(ctx: GuardContext, teamId: string | null): boolean {
    return teamId !== null && ctx.teamIds.includes(teamId)
  }

  /** Admins and Owners read every rule; Builders the organization's and their teams'. */
  private mayRead(ctx: GuardContext, row: Pick<GuardrailRow, 'scope' | 'teamId'>): boolean {
    return (
      holds(ctx, PERMISSIONS.GUARD_MANAGE) ||
      row.scope === 'organization' ||
      this.inTeams(ctx, row.teamId)
    )
  }

  private async findReadable(tx: DbExecutor, ctx: GuardContext, id: string): Promise<GuardrailRow> {
    const row = await this.deps.repository.findGuardrail(tx, ctx.orgId, id)
    if (row === undefined || !this.mayRead(ctx, row)) throw new GuardRuleNotFoundError()
    return row
  }

  /** Locked rules change only through Owners. */
  private async findForChange(
    tx: DbExecutor,
    ctx: GuardContext,
    id: string,
  ): Promise<GuardrailRow> {
    const row = await this.findReadable(tx, ctx, id)
    if (row.isLocked && !holds(ctx, PERMISSIONS.GUARD_LOCK)) throw new GuardRuleLockedError()
    return row
  }

  private async assertTeam(tx: DbExecutor, orgId: string, teamId: string): Promise<void> {
    const [team] = await this.deps.teams.findRefsInTx(tx, orgId, [teamId])
    if (team === undefined) {
      throw new UnprocessableError(ERROR_CODES.VALIDATION_FAILED, 'The team does not exist', {
        details: [{ field: 'teamId' }],
      })
    }
  }

  private async present(tx: DbExecutor, orgId: string, row: GuardrailRow): Promise<GuardrailDto> {
    const refs = await this.deps.refs.load(tx, orgId, {
      userIds: [row.lockedByUserId, row.createdByUserId, row.updatedByUserId],
      teamIds: [row.teamId],
    })
    const twin =
      row.type === 'blocked_action' && row.isEnabled
        ? await this.deps.repository.findBlockingTwin(tx, orgId, row.definition.match, row.id)
        : undefined
    return toGuardrailDto(row, refs, twin ?? null)
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

/** What an update changes, and whether that is T2: turning the rule off or loosening it. */
function planUpdate(current: GuardrailRow, input: UpdateGuardrailInput, userId: string | null) {
  const set: Partial<GuardrailRow> = { updatedByUserId: userId }
  const changes: { field: string; from: unknown; to: unknown }[] = []
  if (input.name !== undefined && input.name !== current.name) {
    set.name = input.name
    changes.push({ field: 'name', from: current.name, to: input.name })
  }
  if (input.definition !== undefined) {
    set.definition = input.definition
    changes.push({ field: 'definition', from: current.definition, to: input.definition })
  }
  if (input.isEnabled !== undefined && input.isEnabled !== current.isEnabled) {
    set.isEnabled = input.isEnabled
    changes.push({ field: 'isEnabled', from: current.isEnabled, to: input.isEnabled })
  }
  const turnedOff = input.isEnabled === false && current.isEnabled
  const loosened =
    input.definition !== undefined && guardrailLoosened(current.definition, input.definition)
  return { set, changes, loosened, needsReason: turnedOff || loosened }
}

// ---- The table ------------------------------------------------------------------------------

function filterRows(rows: readonly TableRow[], query: ListGuardrailsQuery): TableRow[] {
  const term = query.q?.toLowerCase()
  return rows.filter(({ row }) => {
    if (term !== undefined && !row.name.toLowerCase().includes(term)) return false
    if (query.type !== undefined && query.type.length > 0 && !query.type.includes(row.type))
      return false
    if (query.scope !== undefined && query.scope.length > 0 && !query.scope.includes(row.scope))
      return false
    if (query.teamId !== undefined && row.team?.id !== query.teamId) return false
    if (query.isEnabled !== undefined && row.isEnabled !== query.isEnabled) return false
    return true
  })
}

/** Orders two rows by the sort field, ties by id. */
function compareRows(left: TableRow, right: TableRow, field: string): number {
  let order: number
  if (field === 'createdAt') order = left.createdAt - right.createdAt
  else if (field === 'triggeredThisWeek')
    order = left.row.triggeredThisWeek - right.row.triggeredThisWeek
  else order = left.row.name.toLowerCase().localeCompare(right.row.name.toLowerCase())
  return order === 0 ? left.row.id.localeCompare(right.row.id) : order
}

function page(
  rows: readonly TableRow[],
  query: ListGuardrailsQuery,
): { items: GuardRuleRowDto[]; nextCursor: string | null } {
  const sort = query.sort ?? 'name'
  const descending = sort.startsWith('-')
  const field = descending ? sort.slice(1) : sort
  const sorted = [...rows].sort((left, right) => {
    const order = compareRows(left, right, field)
    return descending ? -order : order
  })
  const offset = query.cursor === undefined ? 0 : Number(decodeCursor(query.cursor).k)
  const slice = sorted.slice(offset, offset + query.limit)
  const next = offset + query.limit
  return {
    items: slice.map((entry) => entry.row),
    nextCursor: next < sorted.length && next < GUARDRAILS_LISTED_MAX ? encodeOffset(next) : null,
  }
}
