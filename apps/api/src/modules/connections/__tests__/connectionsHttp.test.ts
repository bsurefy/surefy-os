// SPDX-License-Identifier: AGPL-3.0-only
/* eslint-disable sonarjs/no-clear-text-protocols -- the cases are the plain-http addresses being refused */
import { describe, expect, it } from 'vitest'

import { createOutboundHttp, isBaseUrlAllowed, OutboundError } from '../connectionsHttp.js'

describe('base addresses', () => {
  it('accepts https, and http only for hosts on the install list', () => {
    const local = ['localhost', 'mcp.internal']
    expect(isBaseUrlAllowed('https://api.acme.test/v1', local)).toBe(true)
    expect(isBaseUrlAllowed('http://api.acme.test', local)).toBe(false)
    expect(isBaseUrlAllowed('http://localhost:8080/mcp', local)).toBe(true)
    expect(isBaseUrlAllowed('http://LOCALHOST:8080/mcp', local)).toBe(true)
    expect(isBaseUrlAllowed('http://mcp.internal', local)).toBe(true)
    expect(isBaseUrlAllowed('http://localhost.evil.test', local)).toBe(false)
  })

  it('refuses credentials in the address, other schemes and things that are not addresses', () => {
    expect(isBaseUrlAllowed('https://user:pass@api.acme.test', [])).toBe(false)
    expect(isBaseUrlAllowed('ftp://api.acme.test', [])).toBe(false)
    expect(isBaseUrlAllowed('file:///etc/passwd', [])).toBe(false)
    expect(isBaseUrlAllowed('not a url', [])).toBe(false)
  })
})

describe('the client that calls other apps', () => {
  it('refuses plain http and private addresses unless the host is on the local list', async () => {
    const http = createOutboundHttp({ localHosts: [] })
    await expect(http.external('http://api.acme.test', { method: 'GET' })).rejects.toMatchObject({
      kind: 'unsafe',
    })
    await expect(http.provider('http://api.acme.test', { method: 'GET' })).rejects.toBeInstanceOf(
      OutboundError,
    )
    // a literal private address never connects
    await expect(http.external('https://127.0.0.1:9', { method: 'GET' })).rejects.toMatchObject({
      kind: 'unsafe',
    })
    await expect(
      http.external('https://user:secret@api.acme.test', { method: 'GET' }),
    ).rejects.toMatchObject({ kind: 'unsafe' })
  })

  it('reaches a local host over plain http when it is listed', async () => {
    const http = createOutboundHttp({ localHosts: ['127.0.0.1'] })
    // nothing listens on port 9: the address was allowed, the connection failed
    await expect(http.external('http://127.0.0.1:9', { method: 'GET' })).rejects.toMatchObject({
      kind: 'unreachable',
    })
  })
})
