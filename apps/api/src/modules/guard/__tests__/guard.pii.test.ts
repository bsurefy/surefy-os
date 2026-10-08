// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { GuardPiiBlockedError } from '../guard.errors.js'
import { PiiFilter, resolvePiiRules, splitText } from '../guard.pii.js'
import { settingsOf } from '../guard.ruleSet.js'
import { createFakePii } from './guardTestKit.js'

import type { GuardRuleSets, StoredPiiRule } from '../guard.ruleSet.js'

const ORG = '0198f3a0-0000-7000-8000-000000000001'
const SALES = '0198f3a0-0000-7000-8000-0000000000b1'
const SUPPORT = '0198f3a0-0000-7000-8000-0000000000b2'
const AGENT = '0198f3a0-0000-7000-8000-0000000000a9'

let counter = 0
const rule = (overrides: Partial<StoredPiiRule>): StoredPiiRule => ({
  id: `0198f3a0-0000-7000-8000-${String(++counter).padStart(12, '0')}`,
  piiType: 'email',
  customLabel: null,
  customPattern: null,
  action: 'mask',
  scope: 'organization',
  teamId: null,
  agentId: null,
  ...overrides,
})

const actionOf = (
  rules: StoredPiiRule[],
  scope: Parameters<typeof resolvePiiRules>[1],
  key: string,
) => resolvePiiRules(rules, scope).find((resolved) => resolved.key === key)?.action

describe('resolvePiiRules', () => {
  it('uses the code defaults until the organization has a row', () => {
    expect(actionOf([], { teamIds: [] }, 'email')).toBe('mask')
    expect(actionOf([], { teamIds: [] }, 'payment_card')).toBe('block')
    expect(actionOf([], { teamIds: [] }, 'person_name')).toBe('detect')
  })

  it('lets the organization row replace the default', () => {
    const rules = [rule({ piiType: 'payment_card', action: 'mask' })]
    expect(actionOf(rules, { teamIds: [] }, 'payment_card')).toBe('mask')
  })

  it('lets an exception be looser, with the agent over the teams over the organization', () => {
    const rules = [
      rule({ piiType: 'email', action: 'block' }),
      rule({ piiType: 'email', action: 'detect', scope: 'team', teamId: SALES }),
      rule({ piiType: 'email', action: 'mask', scope: 'agent', agentId: AGENT }),
    ]
    expect(actionOf(rules, { teamIds: [] }, 'email')).toBe('block')
    expect(actionOf(rules, { teamIds: [SALES] }, 'email')).toBe('detect')
    expect(actionOf(rules, { teamIds: [SALES], agentId: AGENT }, 'email')).toBe('mask')
    expect(actionOf(rules, { teamIds: [SUPPORT] }, 'email')).toBe('block')
  })

  it('takes the strictest of several team exceptions', () => {
    const rules = [
      rule({ piiType: 'email', action: 'detect', scope: 'team', teamId: SALES }),
      rule({ piiType: 'email', action: 'block', scope: 'team', teamId: SUPPORT }),
    ]
    expect(actionOf(rules, { teamIds: [SALES, SUPPORT] }, 'email')).toBe('block')
  })

  it('defines a custom type from the organization row and lets exceptions change its action', () => {
    const custom = {
      piiType: 'custom',
      customLabel: 'Employee ID',
      customPattern: 'EMP-\\d{6}',
    } as const
    const rules = [
      rule({ ...custom, action: 'block' }),
      rule({ ...custom, action: 'detect', scope: 'team', teamId: SALES }),
    ]
    const key = 'custom:employee id'
    expect(actionOf(rules, { teamIds: [] }, key)).toBe('block')
    expect(actionOf(rules, { teamIds: [SALES] }, key)).toBe('detect')
    expect(
      resolvePiiRules(rules, { teamIds: [] }).find((entry) => entry.key === key),
    ).toMatchObject({
      customLabel: 'Employee ID',
      customPattern: 'EMP-\\d{6}',
    })
  })
})

describe('splitText', () => {
  it('keeps a short text whole and cuts a long one at whitespace', () => {
    expect(splitText('short', 10)).toEqual(['short'])
    const pieces = splitText('aaaa bbbb cccc dddd', 10)
    expect(pieces.join('')).toBe('aaaa bbbb cccc dddd')
    expect(pieces.every((piece) => piece.length <= 10)).toBe(true)
    expect(splitText('x'.repeat(25), 10).map((piece) => piece.length)).toEqual([10, 10, 5])
  })
})

describe('PiiFilter', () => {
  const filterOver = (piiRules: StoredPiiRule[]) => {
    const ml = createFakePii()
    const ruleSets = {
      get: () =>
        Promise.resolve({ settings: settingsOf(undefined, 'USD'), guardrails: [], piiRules }),
    } as unknown as GuardRuleSets
    return { ml, filter: new PiiFilter({ ruleSets, ml }) }
  }
  const input = (texts: string[], overrides: Partial<Parameters<PiiFilter['apply']>[0]> = {}) => ({
    orgId: ORG,
    texts,
    teamIds: [],
    dataLocation: 'cloud' as const,
    ...overrides,
  })

  it('replaces the types set to mask and leaves the rest alone', async () => {
    const { filter, ml } = filterOver([])
    const result = await filter.apply(input(['Write to ana@acme.test', 'Nothing here', '']))
    expect(result).toMatchObject({
      texts: ['Write to [EMAIL]', 'Nothing here', ''],
      masked: true,
      findings: [{ piiType: 'email', action: 'mask', count: 1 }],
    })
    // only the texts with content were sent, once, for the types that mask or block
    expect(ml.calls).toHaveLength(1)
    expect(ml.calls[0]?.input.texts).toEqual(['Write to ana@acme.test', 'Nothing here'])
    expect(ml.calls[0]?.input.types).toEqual(
      expect.arrayContaining(['email', 'phone', 'payment_card', 'bank_account']),
    )
    expect(ml.calls[0]?.input.types).not.toContain('person_name')
  })

  it('stops the request when a type set to block is found, before anything is returned', async () => {
    const { filter } = filterOver([])
    const error: unknown = await filter
      .apply(input(['Card 4111-1111-1111-1111 for ana@acme.test']))
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GuardPiiBlockedError)
    expect(error).toMatchObject({ code: 'GUARD_PII_BLOCKED', statusCode: 422 })
  })

  it('skips local models and requests with nothing to check', async () => {
    const { filter, ml } = filterOver([])
    expect(await filter.apply(input(['ana@acme.test'], { dataLocation: 'local' }))).toEqual({
      texts: ['ana@acme.test'],
      masked: false,
      findings: [],
    })
    expect(await filter.apply(input(['', '']))).toMatchObject({ masked: false })
    expect(ml.calls).toHaveLength(0)
  })

  it('does not call the service when every type only detects', async () => {
    const detectAll = [
      'person_name',
      'email',
      'phone',
      'payment_card',
      'bank_account',
      'government_id',
      'address',
    ].map((piiType) => rule({ piiType: piiType as StoredPiiRule['piiType'], action: 'detect' }))
    const { filter, ml } = filterOver(detectAll)
    const result = await filter.apply(input(['ana@acme.test 4111-1111-1111-1111']))
    expect(result).toMatchObject({ texts: ['ana@acme.test 4111-1111-1111-1111'], masked: false })
    expect(ml.calls).toHaveLength(0)
  })

  it('applies a team’s or an agent’s exception and a custom pattern', async () => {
    const { filter } = filterOver([
      rule({ piiType: 'email', action: 'detect', scope: 'team', teamId: SALES }),
      rule({
        piiType: 'custom',
        customLabel: 'Employee ID',
        customPattern: 'EMP-\\d{6}',
        action: 'mask',
      }),
    ])
    const text = 'ana@acme.test badge EMP-123456'
    expect((await filter.apply(input([text], { teamIds: [SALES] }))).texts).toEqual([
      'ana@acme.test badge [EMPLOYEE ID]',
    ])
    expect((await filter.apply(input([text]))).texts).toEqual(['[EMAIL] badge [EMPLOYEE ID]'])
  })

  it('stops the request when the service fails: data that cannot be checked does not leave', async () => {
    const { filter, ml } = filterOver([])
    ml.failWith = new Error('ml down')
    await expect(filter.apply(input(['ana@acme.test']))).rejects.toThrow('ml down')
  })

  it('sends long texts in pieces and puts them back together', async () => {
    const { filter, ml } = filterOver([])
    const long = `${'word '.repeat(30_000)}ana@acme.test`
    const result = await filter.apply(input([long]))
    expect(result.texts[0]?.endsWith('[EMAIL]')).toBe(true)
    expect(ml.calls[0]?.input.texts.every((text) => text.length <= 100_000)).toBe(true)
    expect(ml.calls[0]?.input.texts.length).toBeGreaterThan(1)
  })
})
