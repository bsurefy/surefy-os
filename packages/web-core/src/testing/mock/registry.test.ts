// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { defineMockDomain, parseMockDomains, selectMockDomains } from './registry'

const chat = defineMockDomain('chat', [])
const audit = defineMockDomain('audit', [], { isLive: true })

describe('defineMockDomain', () => {
  it('is mocked until its integration task marks it live', () => {
    expect(chat.isLive).toBe(false)
    expect(audit.isLive).toBe(true)
  })

  it('needs a name', () => {
    expect(() => defineMockDomain(' ', [])).toThrow(/needs a name/)
  })
})

describe('parseMockDomains', () => {
  it('reads a comma-separated list, without blanks or repeats', () => {
    expect(parseMockDomains(' chat, ,audit,chat ')).toEqual(['chat', 'audit'])
  })

  it('means "the default" when unset or blank', () => {
    expect(parseMockDomains(undefined)).toBeUndefined()
    expect(parseMockDomains(' , ')).toBeUndefined()
  })
})

describe('selectMockDomains', () => {
  it('mocks every domain not yet live by default and forwards the live ones', () => {
    const selection = selectMockDomains([chat, audit])
    expect(selection.mocked.map((domain) => domain.name)).toEqual(['chat'])
    expect(selection.passthrough).toEqual(['audit'])
  })

  it('mocks exactly the named domains, a live one too', () => {
    const selection = selectMockDomains([chat, audit], ['audit'])
    expect(selection.mocked.map((domain) => domain.name)).toEqual(['audit'])
    expect(selection.passthrough).toEqual(['chat'])
  })

  it('refuses unknown and duplicate names', () => {
    expect(() => selectMockDomains([chat], ['vault'])).toThrow(/Unknown mock domain "vault"/)
    expect(() => selectMockDomains([chat, chat])).toThrow(/registered twice/)
  })
})
