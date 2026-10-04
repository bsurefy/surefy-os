// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { createRequestConfig } from './createRequestConfig'

import type { RequestHints, SharedMessages } from './i18n.types'
import type * as SharedMessagesModule from './loadSharedMessages'

// Outside a Next.js server runtime, next-intl's `getRequestConfig` is not available; in the server
// runtime it returns the callback as is, which is what this mock does.
vi.mock('next-intl/server', () => ({
  getRequestConfig: (create: unknown) => create,
}))

// Only English ships here; the test stands in a second locale to exercise the locale decision.
vi.mock('./loadSharedMessages', async (importOriginal) => {
  const actual = await importOriginal<typeof SharedMessagesModule>()
  const loadSharedMessages = async (locale: string): Promise<SharedMessages> => {
    if (locale === 'en') return actual.loadSharedMessages('en')
    const english = await actual.loadSharedMessages('en')
    return { ...english, common: { ...english.common, close: `Close (${locale})` } }
  }
  return { ...actual, loadSharedMessages }
})

const LOCALES = ['en', 'fr'] as const
const APP_MESSAGES = {
  en: { agents: { title: 'Agents' } },
  fr: { agents: { title: 'Agents (fr)' } },
}

function createConfig(hints: RequestHints = {}) {
  return createRequestConfig({
    locales: LOCALES,
    defaultLocale: 'en',
    loadAppMessages: (locale) => Promise.resolve(APP_MESSAGES[locale]),
    getRequestHints: () => hints,
  })
}

const noRequestLocale = { requestLocale: Promise.resolve(undefined) }

describe('createRequestConfig', () => {
  it('merges the shared namespaces with the app namespaces', async () => {
    const config = await createConfig()(noRequestLocale)

    expect(config.locale).toBe('en')
    expect(config.messages).toMatchObject({
      agents: { title: 'Agents' },
      common: { close: 'Close' },
      validation: { required: 'This field is required.' },
      errors: { fallback: 'Something went wrong. Please try again.' },
    })
  })

  it('uses the locale cookie when it is supported', async () => {
    const config = await createConfig({ locale: 'fr', acceptLanguage: 'en' })(noRequestLocale)

    expect(config.locale).toBe('fr')
    expect(config.messages).toMatchObject({
      agents: { title: 'Agents (fr)' },
      common: { close: 'Close (fr)' },
    })
  })

  it('falls back to Accept-Language, then to the default locale', async () => {
    const negotiated = await createConfig({ locale: 'de', acceptLanguage: 'de, fr;q=0.8' })(
      noRequestLocale,
    )
    const fallback = await createConfig({ locale: 'de', acceptLanguage: 'de' })(noRequestLocale)

    expect(negotiated.locale).toBe('fr')
    expect(fallback.locale).toBe('en')
    expect(fallback.messages).toMatchObject({ agents: { title: 'Agents' } })
  })

  it('prefers an explicit locale and passes the time zone through', async () => {
    const config = await createConfig({ locale: 'en', timeZone: 'Europe/Paris' })({
      locale: 'fr',
      ...noRequestLocale,
    })

    expect(config.locale).toBe('fr')
    expect(config.timeZone).toBe('Europe/Paris')
  })

  it('works without request hints', async () => {
    const config = await createRequestConfig({
      locales: LOCALES,
      defaultLocale: 'en',
      loadAppMessages: (locale) => Promise.resolve(APP_MESSAGES[locale]),
    })(noRequestLocale)

    expect(config.locale).toBe('en')
    expect(config.timeZone).toBeUndefined()
  })
})
