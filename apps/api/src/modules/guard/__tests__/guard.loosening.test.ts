// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { GuardMatch, GuardrailDefinition } from '@surefy/contracts'

import { guardrailLoosened } from '../guard.loosening.js'

const refund: GuardMatch = { action: 'payments.refund' }
const over200: GuardMatch = {
  action: 'payments.refund',
  conditions: [{ field: 'amount', operator: 'gt', value: 200 }],
}
const over500: GuardMatch = {
  action: 'payments.refund',
  conditions: [{ field: 'amount', operator: 'gt', value: 500 }],
}

const approval = (
  overrides: Partial<Extract<GuardrailDefinition, { kind: 'approval_rule' }>> = {},
) =>
  ({
    version: 1,
    kind: 'approval_rule',
    match: refund,
    approvers: [{ type: 'role', id: 'admin' }],
    waitMinutes: 60,
    onTimeout: 'reject',
    escalateTo: [],
    risk: 'medium',
    ...overrides,
  }) as GuardrailDefinition

describe('guardrailLoosened', () => {
  it('treats a match that holds for fewer actions as looser', () => {
    const blocked = (match: typeof refund): GuardrailDefinition => ({
      version: 1,
      kind: 'blocked_action',
      match,
    })
    expect(guardrailLoosened(blocked(refund), blocked(over200))).toBe(true)
    expect(guardrailLoosened(blocked(over200), blocked(refund))).toBe(false)
    expect(guardrailLoosened(blocked(over200), blocked(over500))).toBe(true)
    expect(guardrailLoosened(blocked(refund), blocked({ action: 'payments.charge' }))).toBe(true)
    expect(
      guardrailLoosened(blocked({ action: 'payments.refund' }), blocked({ action: 'payments' })),
    ).toBe(false)
  })

  it('treats a lower risk or a less strict timeout of an approval rule as looser', () => {
    expect(guardrailLoosened(approval(), approval({ risk: 'low' }))).toBe(true)
    expect(guardrailLoosened(approval(), approval({ risk: 'high' }))).toBe(false)
    expect(guardrailLoosened(approval(), approval({ onTimeout: 'continue' }))).toBe(true)
    expect(
      guardrailLoosened(approval({ onTimeout: 'continue' }), approval({ onTimeout: 'reject' })),
    ).toBe(false)
    expect(guardrailLoosened(approval(), approval({ waitMinutes: 600 }))).toBe(false)
  })

  it('treats lower thresholds of an override as looser', () => {
    const override = (autoBp: number, reviewBp: number): GuardrailDefinition => ({
      version: 1,
      kind: 'threshold_override',
      match: refund,
      autoBp,
      reviewBp,
    })
    expect(guardrailLoosened(override(9500, 7000), override(9400, 7000))).toBe(true)
    expect(guardrailLoosened(override(9500, 7000), override(9500, 6000))).toBe(true)
    expect(guardrailLoosened(override(9500, 7000), override(9800, 7500))).toBe(false)
  })

  it('treats a raised or removed bound of a limit as looser', () => {
    const limit = (
      bounds: { perActionAmountMicros?: number; perDayCount?: number },
      onReached: 'block' | 'require_approval' = 'block',
    ): GuardrailDefinition => ({
      version: 1,
      kind: 'action_limit',
      match: refund,
      limit: bounds,
      onReached,
    })
    expect(guardrailLoosened(limit({ perDayCount: 10 }), limit({ perDayCount: 20 }))).toBe(true)
    expect(guardrailLoosened(limit({ perDayCount: 10 }), limit({ perDayCount: 5 }))).toBe(false)
    expect(guardrailLoosened(limit({ perDayCount: 10 }), limit({ perActionAmountMicros: 5 }))).toBe(
      true,
    )
    expect(
      guardrailLoosened(
        limit({ perDayCount: 10 }, 'block'),
        limit({ perDayCount: 10 }, 'require_approval'),
      ),
    ).toBe(true)
    expect(
      guardrailLoosened(
        limit({ perDayCount: 10 }, 'require_approval'),
        limit({ perDayCount: 10 }, 'block'),
      ),
    ).toBe(false)
  })

  it('treats fewer categories or a flag instead of a block as looser for a content filter', () => {
    const filter = (categories: string[], action: 'flag' | 'block'): GuardrailDefinition => ({
      version: 1,
      kind: 'content_filter',
      match: refund,
      categories,
      action,
    })
    expect(
      guardrailLoosened(filter(['hate', 'violence'], 'block'), filter(['hate'], 'block')),
    ).toBe(true)
    expect(guardrailLoosened(filter(['hate'], 'block'), filter(['hate'], 'flag'))).toBe(true)
    expect(guardrailLoosened(filter(['hate'], 'flag'), filter(['hate', 'violence'], 'block'))).toBe(
      false,
    )
  })
})
