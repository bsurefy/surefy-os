// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { AgentDefinitionChange } from '@surefy/contracts'

import { describeChange } from './AgentChangeList.utils'
import messages from '../../../../../messages/en/agents.json'

import type { ChangeTranslator } from './AgentChangeList.utils'

type Messages = Record<string, unknown>

/** A translator over the real messages, filling `{name}` style placeholders. */
const t: ChangeTranslator = (key, values = {}) => {
  const text = key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Messages | undefined)?.[part],
      messages.editor.changes,
    )
  if (typeof text !== 'string') throw new Error(`Missing message ${key}`)
  return text.replaceAll(/\{(\w+)\}/g, (_, name: string) => String(values[name]))
}

const change = (patch: Partial<AgentDefinitionChange>): AgentDefinitionChange => ({
  section: 'instructions',
  kind: 'changed',
  label: 'instructions',
  ...patch,
})

describe('describeChange', () => {
  it('says which field of instructions changed', () => {
    expect(describeChange(change({}), t).text).toBe('Instructions changed')
    expect(describeChange(change({ label: 'tone' }), t).text).toBe('Tone changed')
  })

  it('shows the model and creativity from before to after', () => {
    expect(
      describeChange(change({ section: 'model', label: 'creativity', before: 0.3, after: 0.5 }), t)
        .text,
    ).toBe('Creativity 30% → 50%')
    expect(
      describeChange(
        change({
          section: 'model',
          label: 'doubleCheckModelKey',
          before: null,
          after: 'openai/gpt-4.1-mini',
        }),
        t,
      ).text,
    ).toBe('Double-check model none → openai/gpt-4.1-mini')
  })

  it('says whether a switch was turned on or off', () => {
    expect(
      describeChange(
        change({ section: 'knowledge', label: 'citeSources', before: true, after: false }),
        t,
      ).text,
    ).toBe('Cite sources turned off')
  })

  it('names an added or removed tool', () => {
    expect(
      describeChange(change({ section: 'tools', kind: 'removed', label: 'Refund API' }), t).text,
    ).toBe('Tool Refund API removed')
    expect(
      describeChange(change({ section: 'tools', kind: 'added', label: 'Search' }), t).text,
    ).toBe('Tool Search added')
  })

  it('shows a changed permission of a tool', () => {
    expect(
      describeChange(
        change({
          section: 'tools',
          label: 'Refund API',
          before: { permission: 'read_only', enabled: true },
          after: { permission: 'can_act', enabled: true },
        }),
        t,
      ).text,
    ).toBe('Tool Refund API: Read only → Can act')
  })

  it('says a tool was turned off', () => {
    expect(
      describeChange(
        change({
          section: 'tools',
          label: 'Refund API',
          before: { permission: 'read_only', enabled: true },
          after: { permission: 'read_only', enabled: false },
        }),
        t,
      ).text,
    ).toBe('Tool Refund API turned off')
  })

  it('shows thresholds, and the organization default when there are none', () => {
    expect(
      describeChange(
        change({
          section: 'guard',
          label: 'thresholds',
          before: null,
          after: { autoBp: 9500, reviewBp: 7000 },
        }),
        t,
      ).text,
    ).toBe("Guard thresholds: the organization's → auto 95% · review 70%")
  })

  it('names a Guard rule by its label', () => {
    expect(
      describeChange(
        change({ section: 'guard', kind: 'added', label: 'Approval rule payments.refund' }),
        t,
      ).text,
    ).toBe('Approval rule payments.refund added')
  })
})
