// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  formatFieldValue,
  getEditedInput,
  getFieldKind,
  humanizeKey,
  toFieldDraft,
} from './ApprovalDetail.utils'

const original = { orderId: '1001', amount: 42, note: 'Lost parcel', tags: ['a'] }

describe('humanizeKey', () => {
  it('reads camelCase and snake_case as words', () => {
    expect(humanizeKey('orderId')).toBe('Order id')
    expect(humanizeKey('refund_amount')).toBe('Refund amount')
  })
})

describe('field values', () => {
  it('edits text and numbers, and only shows anything nested', () => {
    expect(getFieldKind('a')).toBe('text')
    expect(getFieldKind(1)).toBe('number')
    expect(getFieldKind(['a'])).toBe('locked')
    expect(formatFieldValue(['a'])).toBe('["a"]')
    expect(toFieldDraft(original)).toEqual({
      orderId: '1001',
      amount: '42',
      note: 'Lost parcel',
      tags: '["a"]',
    })
  })
})

describe('getEditedInput', () => {
  it('finds no change when the draft equals the proposal', () => {
    const result = getEditedInput(original, toFieldDraft(original))
    expect(result).toEqual({ input: original, invalidKeys: [], isChanged: false })
  })

  it('applies edits with their original types', () => {
    const result = getEditedInput(original, {
      ...toFieldDraft(original),
      amount: '30',
      note: 'Damaged',
    })
    expect(result.isChanged).toBe(true)
    expect(result.input).toEqual({ ...original, amount: 30, note: 'Damaged' })
  })

  it('flags a number that is not one, and never edits nested values', () => {
    const result = getEditedInput(original, {
      ...toFieldDraft(original),
      amount: 'lots',
      tags: 'x',
    })
    expect(result.invalidKeys).toEqual(['amount'])
    expect(result.input.tags).toEqual(['a'])
    expect(
      getEditedInput(original, { ...toFieldDraft(original), amount: '-5' }).invalidKeys,
    ).toEqual(['amount'])
  })
})
