// SPDX-License-Identifier: AGPL-3.0-only
import type { DataFilterTypeDto, PiiRuleDto } from '@surefy/contracts'

/** Built-in types are told apart by their type, custom ones by their label. */
export function getLineKey(line: Pick<DataFilterTypeDto, 'piiType' | 'customLabel'>): string {
  return line.piiType === 'custom' ? `custom:${line.customLabel ?? ''}` : line.piiType
}

/** Whom an exception applies to: a team or an agent, by name. */
export function getExceptionTarget(rule: PiiRuleDto): { kind: 'team' | 'agent'; name: string } {
  if (rule.agent) return { kind: 'agent', name: rule.agent.name }
  return { kind: 'team', name: rule.team?.name ?? '' }
}
