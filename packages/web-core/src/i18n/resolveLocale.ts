// SPDX-License-Identifier: AGPL-3.0-only
import type { ResolveLocaleOptions } from './i18n.types'

const WILDCARD = '*'
const DEFAULT_QUALITY = 1

function languageOf(tag: string): string {
  return tag.split('-')[0] ?? tag
}

/** The supported locale for a tag: an exact match first, then the same language (`en-GB` → `en`). */
export function matchLocale<Locale extends string>(
  candidate: string | null | undefined,
  locales: readonly Locale[],
): Locale | undefined {
  const tag = candidate?.trim().toLowerCase()
  if (!tag || tag === WILDCARD) return undefined
  const exact = locales.find((locale) => locale.toLowerCase() === tag)
  if (exact) return exact
  const language = languageOf(tag)
  return locales.find((locale) => languageOf(locale.toLowerCase()) === language)
}

/** The tags of an `Accept-Language` header, best quality first, without `*`. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((entry, index) => {
      const [tag = '', ...parameters] = entry.trim().split(';')
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith('q='))
      const q = quality ? Number.parseFloat(quality.slice(2)) : DEFAULT_QUALITY
      return { tag: tag.trim(), q: Number.isNaN(q) ? 0 : q, index }
    })
    .filter(({ tag, q }) => tag !== '' && tag !== WILDCARD && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ tag }) => tag)
}

/**
 * The locale for a request: the first supported candidate (an explicit locale, the `surefy-locale`
 * cookie), then the best supported `Accept-Language` tag, then the default.
 */
export function resolveLocale<Locale extends string>({
  locales,
  defaultLocale,
  candidates = [],
  acceptLanguage,
}: ResolveLocaleOptions<Locale>): Locale {
  for (const candidate of candidates) {
    const match = matchLocale(candidate, locales)
    if (match) return match
  }
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    const match = matchLocale(tag, locales)
    if (match) return match
  }
  return defaultLocale
}
