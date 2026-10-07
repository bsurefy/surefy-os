// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createEnv } from './createEnv'

const schemas = {
  server: { SITE_URL: z.url(), PORT: z.coerce.number().int() },
  client: { NEXT_PUBLIC_APP_URL: z.url() },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createEnv on the server', () => {
  it('parses server and client variables', () => {
    const env = createEnv({
      ...schemas,
      runtimeEnv: {
        SITE_URL: 'https://app.surefyos.test',
        PORT: '3000',
        NEXT_PUBLIC_APP_URL: 'https://console.surefyos.test',
      },
    })

    expect(env.SITE_URL).toBe('https://app.surefyos.test')
    expect(env.PORT).toBe(3000)
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://console.surefyos.test')
  })

  it('does not validate until a variable is read', () => {
    expect(() =>
      createEnv({
        ...schemas,
        runtimeEnv: { SITE_URL: undefined, PORT: undefined, NEXT_PUBLIC_APP_URL: undefined },
      }),
    ).not.toThrow()
  })

  it('throws on the first read naming every missing or invalid variable', () => {
    const env = createEnv({
      ...schemas,
      runtimeEnv: {
        SITE_URL: 'not a url',
        PORT: undefined,
        NEXT_PUBLIC_APP_URL: 'https://ok.test',
      },
    })

    expect(() => env.NEXT_PUBLIC_APP_URL).toThrow(
      /Invalid environment variables:[\s\S]*SITE_URL[\s\S]*PORT/,
    )
  })

  it('validates once and reuses the parsed values', () => {
    const runtimeEnv = {
      SITE_URL: 'https://app.surefyos.test',
      PORT: '3000',
      NEXT_PUBLIC_APP_URL: 'https://console.surefyos.test',
    }
    const env = createEnv({ ...schemas, runtimeEnv })

    expect(env.PORT).toBe(3000)
    runtimeEnv.PORT = 'not a number'
    expect(env.PORT).toBe(3000)
  })
})

describe('createEnv in the browser', () => {
  it('parses only the client variables and throws when a server one is read', () => {
    vi.stubGlobal('window', {})

    const env = createEnv({
      ...schemas,
      // server values are absent in the browser bundle
      runtimeEnv: { SITE_URL: undefined, PORT: undefined, NEXT_PUBLIC_APP_URL: 'https://ok.test' },
    })

    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://ok.test')
    expect(() => env.SITE_URL).toThrow(/SITE_URL is server-only/)
  })
})
