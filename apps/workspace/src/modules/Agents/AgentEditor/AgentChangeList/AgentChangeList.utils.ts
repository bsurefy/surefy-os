// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentDefinitionChange } from '@surefy/contracts'

import type { DescribedChange } from './AgentChangeList.types'

/** The translator of `agents.editor.changes`. */
export type ChangeTranslator = (key: string, values?: Record<string, string | number>) => string

const PERCENT = 100
const FIELDS_WITH_VALUES = new Set(['modelKey', 'creativity', 'doubleCheckModelKey', 'thresholds'])
const FIELDS_ON_OFF = new Set(['useVaultFallback', 'citeSources', 'onlyFromKnowledge'])

interface ToolLike {
  permission?: string
  enabled?: boolean
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** A value of a changed field in words: "30%", "on", "auto 90% · review 60%". */
function formatValue(field: string, value: unknown, t: ChangeTranslator): string {
  if (value === null || value === undefined) {
    return t(field === 'thresholds' ? 'values.followOrganization' : 'values.none')
  }
  if (field === 'creativity' && typeof value === 'number') {
    return `${Math.round(value * PERCENT)}%`
  }
  if (field === 'thresholds' && isObject(value)) {
    return t('values.thresholds', {
      auto: Math.round(Number(value.autoBp) / PERCENT),
      review: Math.round(Number(value.reviewBp) / PERCENT),
    })
  }
  if (typeof value === 'boolean') return t(value ? 'values.on' : 'values.off')
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : JSON.stringify(value)
}

function describeTool(change: AgentDefinitionChange, t: ChangeTranslator): string {
  const name = change.label
  if (change.kind === 'added') return t('tools.added', { name })
  if (change.kind === 'removed') return t('tools.removed', { name })
  const before = (isObject(change.before) ? change.before : {}) as ToolLike
  const after = (isObject(change.after) ? change.after : {}) as ToolLike
  if (before.permission !== after.permission && after.permission !== undefined) {
    return t('tools.permission', {
      name,
      before: t(`permissions.${before.permission ?? 'read_only'}`),
      after: t(`permissions.${after.permission}`),
    })
  }
  if (before.enabled !== after.enabled && after.enabled !== undefined) {
    return t(after.enabled ? 'tools.turnedOn' : 'tools.turnedOff', { name })
  }
  return t('tools.changed', { name })
}

/** One change in words; the same change reads the same on Publish and on Versions. */
export function describeChange(
  change: AgentDefinitionChange,
  t: ChangeTranslator,
): DescribedChange {
  const { section, kind, label } = change
  let text: string
  if (section === 'tools') {
    text = describeTool(change, t)
  } else if (section === 'guard' && label !== 'thresholds') {
    // a rule: its label already names the kind of rule and the action
    text = t(`rules.${kind}`, { name: label })
  } else if (FIELDS_WITH_VALUES.has(label)) {
    text = t(`fields.${label}`, {
      before: formatValue(label, change.before, t),
      after: formatValue(label, change.after, t),
    })
  } else if (FIELDS_ON_OFF.has(label)) {
    text = t(`fields.${label}`, { after: formatValue(label, change.after, t) })
  } else {
    text = t(`fields.${label}`)
  }
  return { text, section, kind }
}
