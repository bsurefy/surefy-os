// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createZodErrorMap, resolveIssueKey } from './zodErrorMap'
import validation from '../../messages/en/validation.json'

const t = createTranslator({ locale: 'en', messages: { validation }, namespace: 'validation' })
const error = createZodErrorMap(t)

function firstMessage(schema: z.ZodType, value: unknown): string | undefined {
  return schema.safeParse(value, { error }).error?.issues[0]?.message
}

describe('createZodErrorMap', () => {
  it('translates a missing value as required', () => {
    expect(firstMessage(z.string(), undefined)).toBe('This field is required.')
    expect(firstMessage(z.string().min(1), '')).toBe('This field is required.')
  })

  it('fills in the minimum and maximum, with plurals', () => {
    expect(firstMessage(z.string().min(3), 'ab')).toBe('Must be at least 3 characters.')
    expect(firstMessage(z.string().max(1), 'ab')).toBe('Must be at most 1 character.')
    expect(firstMessage(z.string().length(4), 'ab')).toBe('Must be exactly 4 characters.')
  })

  it('tells numbers, items and dates apart', () => {
    expect(firstMessage(z.number().min(10), 5)).toBe('Must be 10 or more.')
    expect(firstMessage(z.number().gt(10), 5)).toBe('Must be more than 10.')
    expect(firstMessage(z.number().max(2), 5)).toBe('Must be 2 or less.')
    expect(firstMessage(z.array(z.string()).min(2), ['a'])).toBe('Choose at least 2 items.')
    expect(firstMessage(z.array(z.string()).max(1), ['a', 'b'])).toBe('Choose at most 1 item.')
    expect(firstMessage(z.date().min(new Date('2030-01-01')), new Date('2020-01-01'))).toMatch(
      /^Must be on or after /,
    )
  })

  it('names the format that failed', () => {
    expect(firstMessage(z.email(), 'nope')).toBe('Enter a valid email address.')
    expect(firstMessage(z.url(), 'nope')).toBe('Enter a valid URL, starting with https://.')
    expect(firstMessage(z.uuid(), 'nope')).toBe('Enter a valid identifier.')
    expect(firstMessage(z.string().startsWith('sk-'), 'nope')).toBe('Must start with "sk-".')
    expect(firstMessage(z.string().regex(/^\d+$/), 'nope')).toBe('This value has the wrong format.')
    expect(firstMessage(z.iso.date(), 'nope')).toBe('Enter a valid date.')
  })

  it('handles values, types and steps', () => {
    expect(firstMessage(z.enum(['a', 'b']), 'c')).toBe('Choose one of the allowed values.')
    expect(firstMessage(z.number(), 'text')).toBe('Enter a valid value.')
    expect(firstMessage(z.number().multipleOf(5), 7)).toBe('Must be a multiple of 5.')
    expect(firstMessage(z.strictObject({ a: z.string() }), { a: 'x', b: 1 })).toBe(
      'This contains fields that are not allowed.',
    )
  })

  it('falls back to the generic issue text, then to the custom text', () => {
    expect(firstMessage(z.union([z.string(), z.number()]), true)).toBe(
      'This value does not match any of the allowed shapes.',
    )
    expect(
      firstMessage(
        z.string().refine(() => false),
        'x',
      ),
    ).toBe('This value is not valid.')
  })

  it('leaves a message the schema sets itself untouched', () => {
    expect(
      firstMessage(
        z.string().refine(() => false, { message: 'custom.passwordsMismatch' }),
        'x',
      ),
    ).toBe('custom.passwordsMismatch')
  })

  it('maps an unknown code to its generic issue key', () => {
    expect(resolveIssueKey({ code: 'invalid_key', origin: 'map', issues: [], input: {} })).toEqual({
      key: 'issues.invalid_key',
    })
  })
})
