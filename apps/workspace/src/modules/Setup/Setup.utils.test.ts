// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { SetupCheckDto } from '@surefy/contracts'

import { hasBlockingFailure, isEmailAvailable, parseEmails, slugFromName } from './Setup.utils'

const check = (overrides: Partial<SetupCheckDto>): SetupCheckDto => ({
  key: 'database',
  status: 'ok',
  blocking: true,
  code: null,
  detail: null,
  ...overrides,
})

describe('slugFromName', () => {
  it('turns a name into a URL address', () => {
    expect(slugFromName('Acme Logistics')).toBe('acme-logistics')
    expect(slugFromName('  Acme & Sons, Ltd.  ')).toBe('acme-sons-ltd')
  })

  it('drops accents', () => {
    expect(slugFromName('Café Münster')).toBe('cafe-munster')
  })

  it('stays within 48 characters without a trailing hyphen', () => {
    const slug = slugFromName(`${'a'.repeat(47)} b`)
    expect(slug.length).toBeLessThanOrEqual(48)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('is empty when nothing usable is left', () => {
    expect(slugFromName('!!!')).toBe('')
  })
})

describe('hasBlockingFailure', () => {
  it('stops only for a failed blocking check', () => {
    expect(hasBlockingFailure([check({ status: 'failed' })])).toBe(true)
    expect(hasBlockingFailure([check({ key: 'gpu', status: 'failed', blocking: false })])).toBe(
      false,
    )
    expect(hasBlockingFailure([check({ status: 'ok' })])).toBe(false)
  })
})

describe('isEmailAvailable', () => {
  it('reads the email check', () => {
    expect(isEmailAvailable([check({ key: 'email', status: 'ok', blocking: false })])).toBe(true)
    expect(isEmailAvailable([check({ key: 'email', status: 'warning', blocking: false })])).toBe(
      false,
    )
  })

  it('assumes email works when the check did not run', () => {
    expect(isEmailAvailable([])).toBe(true)
  })
})

describe('parseEmails', () => {
  it('splits on lines, commas and spaces and drops repeats', () => {
    expect(parseEmails('a@x.test, B@x.test\nc@x.test  a@x.test;')).toEqual([
      'a@x.test',
      'b@x.test',
      'c@x.test',
    ])
  })

  it('is empty for blank input', () => {
    expect(parseEmails('  \n ')).toEqual([])
  })
})
