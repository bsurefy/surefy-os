// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { matchLocale, parseAcceptLanguage, resolveLocale } from './resolveLocale'

const LOCALES = ['en', 'fr', 'pt-BR'] as const

describe('parseAcceptLanguage', () => {
  it('orders tags by quality and drops wildcards', () => {
    expect(parseAcceptLanguage('de;q=0.7, fr, *;q=0.1, en;q=0.9')).toEqual(['fr', 'en', 'de'])
  })

  it('returns nothing for a missing or empty header', () => {
    expect(parseAcceptLanguage(null)).toEqual([])
    expect(parseAcceptLanguage('')).toEqual([])
  })

  it('ignores tags with a quality of zero or an unreadable quality', () => {
    expect(parseAcceptLanguage('de;q=0, fr;q=abc, en')).toEqual(['en'])
  })
})

describe('matchLocale', () => {
  it('matches exactly, ignoring case', () => {
    expect(matchLocale('PT-br', LOCALES)).toBe('pt-BR')
  })

  it('falls back to the same language', () => {
    expect(matchLocale('en-GB', LOCALES)).toBe('en')
    expect(matchLocale('pt', LOCALES)).toBe('pt-BR')
  })

  it('returns undefined for unsupported, empty or wildcard tags', () => {
    expect(matchLocale('de', LOCALES)).toBeUndefined()
    expect(matchLocale('  ', LOCALES)).toBeUndefined()
    expect(matchLocale('*', LOCALES)).toBeUndefined()
    expect(matchLocale(undefined, LOCALES)).toBeUndefined()
  })
})

describe('resolveLocale', () => {
  it('takes the first supported candidate', () => {
    const locale = resolveLocale({
      locales: LOCALES,
      defaultLocale: 'en',
      candidates: ['de', undefined, 'fr'],
      acceptLanguage: 'pt-BR',
    })

    expect(locale).toBe('fr')
  })

  it('negotiates Accept-Language when no candidate is supported', () => {
    const locale = resolveLocale({
      locales: LOCALES,
      defaultLocale: 'en',
      candidates: ['de'],
      acceptLanguage: 'es, pt;q=0.8, en;q=0.5',
    })

    expect(locale).toBe('pt-BR')
  })

  it('falls back to the default locale', () => {
    expect(resolveLocale({ locales: LOCALES, defaultLocale: 'en', acceptLanguage: 'de' })).toBe(
      'en',
    )
    expect(resolveLocale({ locales: LOCALES, defaultLocale: 'en' })).toBe('en')
  })
})
