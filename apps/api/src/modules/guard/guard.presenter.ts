// SPDX-License-Identifier: AGPL-3.0-only
import type {
  GuardrailDto,
  GuardRuleRowDto,
  GuardSettingsDto,
  PiiRuleDto,
  TeamRefDto,
  UserRefDto,
} from '@surefy/contracts'

import { NIL_UUID } from './guard.constants.js'

import type { GuardrailRow, GuardSettingsRow, PiiRuleRow } from './guard.repository.js'
import type { GuardSettingsValues } from './guard.ruleSet.js'
import type { GuardSubjects, GuardTeams, GuardUserRefs } from './guard.types.js'
import type { DbExecutor } from '@/core/database/index.js'

/** The people, teams and agents a set of rows points at, looked up once. */
export interface GuardRefs {
  users: ReadonlyMap<string, UserRefDto>
  teams: ReadonlyMap<string, TeamRefDto>
  agents: ReadonlyMap<string, string>
}

export const EMPTY_REFS: GuardRefs = { users: new Map(), teams: new Map(), agents: new Map() }

export interface RefsWanted {
  userIds?: Iterable<string | null>
  teamIds?: Iterable<string | null>
  agentIds?: Iterable<string | null>
}

const idsOf = (values: Iterable<string | null> | undefined): string[] => [
  ...new Set([...(values ?? [])].filter((value): value is string => value !== null)),
]

/** Looks up display data through the modules that own it. */
export class GuardRefsLoader {
  constructor(
    private readonly users: GuardUserRefs,
    private readonly teams: GuardTeams,
    private readonly subjects: GuardSubjects,
  ) {}

  async load(tx: DbExecutor, orgId: string, wanted: RefsWanted): Promise<GuardRefs> {
    const userIds = idsOf(wanted.userIds)
    const teamIds = idsOf(wanted.teamIds)
    const agentIds = idsOf(wanted.agentIds)
    // one transaction runs one query at a time
    const users =
      userIds.length === 0 ? new Map<string, UserRefDto>() : await this.users.findUserRefs(userIds)
    const teams = teamIds.length === 0 ? [] : await this.teams.findRefsInTx(tx, orgId, teamIds)
    const agents =
      agentIds.length === 0
        ? new Map<string, string>()
        : await this.subjects.agentNames(tx, orgId, agentIds)
    return { users, teams: new Map(teams.map((team) => [team.id, team])), agents }
  }
}

const userOf = (refs: GuardRefs, id: string | null): UserRefDto | null =>
  id === null ? null : (refs.users.get(id) ?? null)

const teamOf = (refs: GuardRefs, id: string | null): TeamRefDto | null =>
  id === null ? null : (refs.teams.get(id) ?? null)

export function toSettingsDto(
  row: GuardSettingsRow | undefined,
  values: GuardSettingsValues,
  refs: GuardRefs,
): GuardSettingsDto {
  return {
    autoThresholdBp: values.autoBp,
    reviewThresholdBp: values.reviewBp,
    quickApproveMaxAmountMicros: values.quickApproveMaxAmountMicros,
    quickApproveMaxRisk: values.quickApproveMaxRisk,
    stepUpAmountMicros: values.stepUpAmountMicros,
    targetDecisionMinutes: values.targetDecisionMinutes,
    currency: values.currency,
    isCustomized: row !== undefined,
    updatedBy: userOf(refs, row?.updatedByUserId ?? null),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  }
}

export function toGuardrailDto(
  row: GuardrailRow,
  refs: GuardRefs,
  conflictsWith: { id: string; name: string } | null,
): GuardrailDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    scope: row.scope,
    team: teamOf(refs, row.teamId),
    definition: row.definition,
    isEnabled: row.isEnabled,
    isLocked: row.isLocked,
    lockedBy: userOf(refs, row.lockedByUserId),
    lockedReason: row.lockedReason,
    conflictsWith,
    createdBy: userOf(refs, row.createdByUserId),
    updatedBy: userOf(refs, row.updatedByUserId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** A stored guardrail as a row of the Guardrails table. */
export function toGuardrailRow(
  row: GuardrailRow,
  refs: GuardRefs,
  usedByCount: number,
  triggeredThisWeek: number,
): GuardRuleRowDto {
  return {
    id: row.id,
    ruleKey: null,
    name: row.name,
    type: row.type,
    scope: row.scope,
    team: teamOf(refs, row.teamId),
    usedByCount,
    triggeredThisWeek,
    isEnabled: row.isEnabled,
    isLocked: row.isLocked,
    lockedBy: userOf(refs, row.lockedByUserId),
    lockedReason: row.lockedReason,
    editTarget: null,
  }
}

const typeName = (row: PiiRuleRow): string =>
  row.piiType === 'custom' ? (row.customLabel ?? 'custom') : row.piiType.replaceAll('_', ' ')

/** A personal-data rule as a read-only row of the Guardrails table. */
export function toPiiRuleRow(row: PiiRuleRow, refs: GuardRefs): GuardRuleRowDto {
  return {
    id: row.id,
    ruleKey: null,
    name: `Personal data: ${typeName(row)} (${row.action})`,
    type: 'data_filter',
    scope: row.scope,
    team: teamOf(refs, row.teamId),
    usedByCount: 0,
    triggeredThisWeek: 0,
    isEnabled: true,
    isLocked: false,
    lockedBy: null,
    lockedReason: null,
    editTarget: { type: 'data_filters', id: null },
  }
}

export function toPiiRuleDto(row: PiiRuleRow, refs: GuardRefs): PiiRuleDto {
  return {
    id: row.id,
    piiType: row.piiType,
    customLabel: row.customLabel,
    customPattern: row.customPattern,
    action: row.action,
    scope: row.scope,
    team: teamOf(refs, row.teamId),
    agent:
      row.agentId === null
        ? null
        : { id: row.agentId, name: refs.agents.get(row.agentId) ?? 'Deleted agent' },
    createdBy: userOf(refs, row.createdByUserId),
    updatedBy: userOf(refs, row.updatedByUserId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** An opaque cursor for the in-memory pages of the Guardrails table: the offset of the next row. */
export const encodeOffset = (offset: number): string =>
  Buffer.from(JSON.stringify({ k: String(offset), id: NIL_UUID })).toString('base64url')
