// SPDX-License-Identifier: AGPL-3.0-only
import { createServer, type Server } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { safeGet, UnsafeAddressError } from '../safeFetch.js'

import type { AddressInfo } from 'node:net'

// A server on the loopback address stands in for the internal network: `safeGet` must not reach
// it unless its host is one of the install's local hosts.

let server: Server
let port: number

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/elsewhere') {
      response.writeHead(302, { location: `http://127.0.0.1:${String(port)}/page` })
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('internal')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('safeGet', () => {
  it('refuses private addresses written as an IP, which are never resolved', async () => {
    await expect(safeGet(`http://127.0.0.1:${String(port)}/page`)).rejects.toThrow(
      UnsafeAddressError,
    )
    await expect(safeGet(`http://[::1]:${String(port)}/page`)).rejects.toThrow(UnsafeAddressError)
  })

  it('refuses host names that resolve to a private address', async () => {
    await expect(safeGet(`http://localhost:${String(port)}/page`)).rejects.toThrow(
      UnsafeAddressError,
    )
  })

  it('reaches the install’s local hosts when asked to', async () => {
    const response = await safeGet(`http://127.0.0.1:${String(port)}/page`, {
      localHosts: ['127.0.0.1'],
    })
    expect(response.status).toBe(200)
    expect(response.body.toString()).toBe('internal')
  })

  it('judges every redirect on its own', async () => {
    // a local host may redirect to itself; a redirect to an address off the list is refused
    const local = await safeGet(`http://127.0.0.1:${String(port)}/elsewhere`, {
      localHosts: ['127.0.0.1'],
    })
    expect(local.url).toBe(`http://127.0.0.1:${String(port)}/page`)
    await expect(
      safeGet(`http://localhost:${String(port)}/elsewhere`, { localHosts: ['localhost'] }),
    ).rejects.toThrow(UnsafeAddressError)
  })
})
