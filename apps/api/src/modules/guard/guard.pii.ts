// SPDX-License-Identifier: AGPL-3.0-only
import { BUILT_IN_PII_TYPES, PII_FILTER_DEFAULTS, strictestPiiAction } from '@surefy/contracts'
import type { BuiltInPiiType, PiiAction, PiiType } from '@surefy/contracts'

import { PII_BATCH_MAX_TEXTS } from './guard.constants.js'
import { GuardPiiBlockedError } from './guard.errors.js'

import type { StoredPiiRule, GuardRuleSets } from './guard.ruleSet.js'
import type { GuardPiiService } from './guard.types.js'

/** What one personal-data type does for a given team and agent. */
export interface ResolvedPiiRule {
  /** The built-in type, or `custom:{label in lowercase}`. */
  key: string
  piiType: PiiType
  customLabel: string | null
  customPattern: string | null
  action: PiiAction
}

export const customKey = (label: string): string => `custom:${label.toLowerCase()}`

const keyOf = (rule: Pick<StoredPiiRule, 'piiType' | 'customLabel'>): string =>
  rule.piiType === 'custom' ? customKey(rule.customLabel ?? '') : rule.piiType

/** The organization's action per built-in type: its row, else the code default. */
export function organizationAction(
  rules: readonly StoredPiiRule[],
  type: BuiltInPiiType,
): PiiAction {
  return (
    rules.find((rule) => rule.scope === 'organization' && rule.piiType === type)?.action ??
    PII_FILTER_DEFAULTS[type]
  )
}

/**
 * The personal-data filter is the one place where narrower rules may be looser: per type, an agent
 * exception wins over team exceptions, which win over the organization row, which wins over the
 * code default. Among several team rows the strictest wins (database/guard-and-approvals.md,
 * "How rules merge").
 */
export function resolvePiiRules(
  rules: readonly StoredPiiRule[],
  scope: { teamIds: readonly string[]; agentId?: string | null },
): ResolvedPiiRule[] {
  const agentRows = rules.filter(
    (rule) =>
      rule.scope === 'agent' && scope.agentId !== undefined && rule.agentId === scope.agentId,
  )
  const teamRows = rules.filter(
    (rule) => rule.scope === 'team' && rule.teamId !== null && scope.teamIds.includes(rule.teamId),
  )
  const orgRows = rules.filter((rule) => rule.scope === 'organization')
  const resolved: ResolvedPiiRule[] = []

  for (const type of BUILT_IN_PII_TYPES) {
    const agent = agentRows.find((rule) => rule.piiType === type)
    const teams = teamRows.filter((rule) => rule.piiType === type)
    const [firstTeam, ...otherTeams] = teams.map((rule) => rule.action)
    const action =
      agent?.action ??
      (firstTeam === undefined ? undefined : strictestPiiAction([firstTeam, ...otherTeams])) ??
      organizationAction(rules, type)
    resolved.push({ key: type, piiType: type, customLabel: null, customPattern: null, action })
  }

  // custom types are the organization's (its pattern); exceptions change the action only
  for (const org of orgRows.filter((rule) => rule.piiType === 'custom')) {
    const key = keyOf(org)
    const agent = agentRows.find((rule) => keyOf(rule) === key)
    const teams = teamRows.filter((rule) => keyOf(rule) === key)
    const [firstTeam, ...otherTeams] = teams.map((rule) => rule.action)
    const action =
      agent?.action ??
      (firstTeam === undefined ? undefined : strictestPiiAction([firstTeam, ...otherTeams])) ??
      org.action
    resolved.push({
      key,
      piiType: 'custom',
      customLabel: org.customLabel,
      customPattern: org.customPattern,
      action,
    })
  }
  return resolved
}

/** The built-in types and custom patterns to send to the ML service for these rules. */
export function mlTypesOf(rules: readonly ResolvedPiiRule[]) {
  return {
    types: rules.flatMap((rule) => (rule.piiType === 'custom' ? [] : [rule.piiType])),
    customPatterns: rules.flatMap((rule) =>
      rule.piiType === 'custom' && rule.customLabel !== null && rule.customPattern !== null
        ? [{ label: rule.customLabel, pattern: rule.customPattern }]
        : [],
    ),
  }
}

/** Counts one finding of the ML service under the rule that governs its type. */
export function tally(
  counts: Map<string, PiiFilterFinding>,
  rules: ReadonlyMap<string, ResolvedPiiRule>,
  finding: { type: string; customLabel: string | null },
): void {
  const key = finding.type === 'custom' ? customKey(finding.customLabel ?? '') : finding.type
  const rule = rules.get(key)
  if (rule === undefined) return
  const seen = counts.get(key)
  if (seen === undefined) {
    counts.set(key, {
      piiType: rule.piiType,
      customLabel: rule.customLabel,
      action: rule.action,
      count: 1,
    })
  } else {
    seen.count += 1
  }
}

/** The pieces to send, each with the position of its text; empty texts are not sent. */
function piecesOf(texts: readonly string[]): { index: number; text: string }[] {
  const pieces: { index: number; text: string }[] = []
  for (const [index, text] of texts.entries()) {
    if (text.length === 0) continue
    for (const piece of splitText(text, ML_TEXT_MAX)) pieces.push({ index, text: piece })
  }
  return pieces
}

/** Each text with its masked pieces joined back; texts that were not sent stay as they were. */
function reassemble(texts: readonly string[], masked: ReadonlyMap<number, string[]>): string[] {
  return texts.map((text, index) => masked.get(index)?.join('') ?? text)
}

/** Splits at whitespace so no piece passes `max` characters; one piece when it already fits. */
export function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const pieces: string[] = []
  let rest = text
  while (rest.length > max) {
    const window = rest.slice(0, max)
    const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '))
    const at = cut > 0 ? cut + 1 : max
    pieces.push(rest.slice(0, at))
    rest = rest.slice(at)
  }
  pieces.push(rest)
  return pieces
}

/** The service's own limit per text, in characters (`MAX_TEXT_LENGTH` of the ML schema). */
const ML_TEXT_MAX = 100_000

export interface PiiFilterInput {
  orgId: string
  texts: readonly string[]
  teamIds: readonly string[]
  agentId?: string | null
  /** Local models keep the data on the organization's network, so the filter does not apply. */
  dataLocation: 'cloud' | 'local'
  locale?: string
  requestId?: string
}

export interface PiiFilterFinding {
  piiType: PiiType
  customLabel: string | null
  action: PiiAction
  count: number
}

export interface PiiFilterResult {
  /** The texts to send on, in the order they came. */
  texts: string[]
  /** Whether masking changed any text (`usage_events.pii_masked`). */
  masked: boolean
  findings: PiiFilterFinding[]
}

export interface PiiFilterDeps {
  ruleSets: GuardRuleSets
  ml: GuardPiiService
}

/**
 * The personal-data filter (integrations.md, "ML service"): applied before data leaves for a cloud
 * model or search provider. Types set to `mask` are replaced by placeholders; a type set to
 * `block` found anywhere in the request stops it (`GUARD_PII_BLOCKED`) before anything is sent.
 * The ML service failing stops the request too: data that cannot be checked does not leave.
 */
export class PiiFilter {
  constructor(private readonly deps: PiiFilterDeps) {}

  async apply(input: PiiFilterInput): Promise<PiiFilterResult> {
    if (input.dataLocation === 'local')
      return { texts: [...input.texts], masked: false, findings: [] }
    const rules = await this.deps.ruleSets.get(input.orgId)
    const resolved = resolvePiiRules(rules.piiRules, {
      teamIds: input.teamIds,
      agentId: input.agentId ?? null,
    })
    const active = resolved.filter((rule) => rule.action !== 'detect')
    const hasWork = active.length > 0 && input.texts.some((text) => text.length > 0)
    if (!hasWork) return { texts: [...input.texts], masked: false, findings: [] }

    const pieces = piecesOf(input.texts)
    const masked = new Map<number, string[]>()
    const counts = new Map<string, PiiFilterFinding>()
    const request = {
      orgId: input.orgId,
      ...mlTypesOf(active),
      ...(input.locale === undefined ? {} : { locale: input.locale }),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    }
    const byKey = new Map(active.map((rule) => [rule.key, rule]))
    for (let start = 0; start < pieces.length; start += PII_BATCH_MAX_TEXTS) {
      const batch = pieces.slice(start, start + PII_BATCH_MAX_TEXTS)
      const answer = await this.deps.ml.maskPii({
        ...request,
        texts: batch.map((piece) => piece.text),
      })
      for (const [position, result] of answer.results.entries()) {
        const piece = batch[position]
        if (piece === undefined) continue
        masked.set(piece.index, [...(masked.get(piece.index) ?? []), result.text])
        for (const finding of result.findings) tally(counts, byKey, finding)
      }
    }
    const findings = [...counts.values()]
    const blocked = findings.filter((finding) => finding.action === 'block')
    if (blocked.length > 0)
      throw new GuardPiiBlockedError(blocked.map((finding) => finding.piiType))
    const texts = reassemble(input.texts, masked)
    return { texts, masked: findings.some((finding) => finding.action === 'mask'), findings }
  }
}
