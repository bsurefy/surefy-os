// SPDX-License-Identifier: AGPL-3.0-only
import { createServer } from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { okResponse } from '@surefy/contracts'
import {
  configureMockScenarios,
  defineMockDomain,
  defineMockHandler,
  resetMockSettings,
} from '@surefy/web-core/testing/mock'

import { readMockServerConfig } from './config'
import { createMockServer } from './server'

import type { MockServerConfig } from './config'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const thing = z.object({ id: z.string(), name: z.string() })

const things = defineMockDomain('things', [
  defineMockHandler({
    method: 'get',
    path: '/things/:thingId',
    response: okResponse(thing),
    scenarios: {
      default: ({ params }) => ({ data: { id: String(params.thingId), name: 'Thing' } }),
      broken: () => ({ data: { id: 1 } }) as never,
    },
  }),
])
const others = defineMockDomain('others', [
  defineMockHandler({
    method: 'get',
    path: '/others',
    response: okResponse(thing),
    scenarios: { default: () => ({ data: { id: 'o', name: 'Mocked other' } }) },
  }),
])

const listen = (server: Server) =>
  new Promise<string>((resolve) => {
    server.listen(0, () => {
      resolve(`http://localhost:${(server.address() as AddressInfo).port}`)
    })
  })
const close = (server: Server) => new Promise((resolve) => server.close(resolve))

let upstream: Server
let upstreamUrl: string
let servers: Server[] = []

async function start(overrides: Partial<MockServerConfig> = {}): Promise<string> {
  const { server } = createMockServer(
    [things, others],
    { port: 0, upstreamUrl, domains: undefined, defaultScenario: undefined, ...overrides },
    vi.fn(),
  )
  servers.push(server)
  return listen(server)
}

beforeEach(async () => {
  configureMockScenarios({ slowDelayMs: 0 })
  upstream = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['a=1', 'b=2'] })
      res.end(JSON.stringify({ upstream: true, method: req.method, url: req.url, body }))
    })
  })
  upstreamUrl = await listen(upstream)
})

afterEach(async () => {
  await Promise.all([...servers.map(close), close(upstream)])
  servers = []
  resetMockSettings()
})

describe('dev mock server', () => {
  it('answers a mocked route with contract-valid data and names the scenario', async () => {
    const base = await start()
    const response = await fetch(`${base}/api/v1/things/t1`)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-mock-scenario')).toBe('default')
    expect(await response.json()).toEqual({ data: { id: 't1', name: 'Thing' } })
  })

  it('forwards unmocked routes to the real API with their body and cookies', async () => {
    const base = await start()
    const response = await fetch(`${base}/api/auth/sign-in/email?x=1`, {
      method: 'POST',
      body: '{"email":"a@example.test"}',
    })
    expect(await response.json()).toEqual({
      upstream: true,
      method: 'POST',
      url: '/api/auth/sign-in/email?x=1',
      body: '{"email":"a@example.test"}',
    })
    expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
  })

  it('forwards the registered domains left out of MOCK_DOMAINS', async () => {
    const base = await start({ domains: ['things'] })
    expect(
      ((await (await fetch(`${base}/api/v1/others`)).json()) as { upstream?: boolean }).upstream,
    ).toBe(true)
    expect((await fetch(`${base}/api/v1/things/t1`)).headers.get('x-mock-scenario')).toBe('default')
  })

  it('switches scenarios by cookie and by the configured default', async () => {
    const base = await start({ defaultScenario: 'forbidden' })
    const forbidden = await fetch(`${base}/api/v1/things/t1`)
    expect(forbidden.status).toBe(403)
    expect(((await forbidden.json()) as { error: { code: string } }).error.code).toBe(
      'ACCESS_FORBIDDEN',
    )

    const gated = await fetch(`${base}/api/v1/things/t1`, { headers: { cookie: 'scenario=gated' } })
    expect(((await gated.json()) as { error: { code: string } }).error.code).toBe(
      'FEATURE_NOT_AVAILABLE',
    )
  })

  it('drops the connection in the offline scenario', async () => {
    const base = await start()
    await expect(fetch(`${base}/api/v1/things/t1?scenario=offline`)).rejects.toThrow()
  })

  it('fails loudly when a handler breaks its contract', async () => {
    const base = await start()
    const response = await fetch(`${base}/api/v1/things/t1?scenario=broken`)
    expect(response.status).toBe(500)
    expect(response.headers.get('x-mock-contract-error')).toBe('true')
  })

  it('answers 502 with the error envelope when the real API is down', async () => {
    const base = await start({ upstreamUrl: 'http://localhost:1' })
    const response = await fetch(`${base}/api/auth/session`)
    expect(response.status).toBe(502)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    )
  })

  it('sets and clears the scenario cookie from its control page', async () => {
    const base = await start()
    const page = await fetch(`${base}/__mock`)
    expect(await page.text()).toContain('<code>things</code>')

    const set = await fetch(`${base}/__mock/scenario?set=empty`, { redirect: 'manual' })
    expect(set.status).toBe(303)
    expect(set.headers.get('set-cookie')).toMatch(/^scenario=empty;/)

    const cleared = await fetch(`${base}/__mock/scenario?set=default`, { redirect: 'manual' })
    expect(cleared.headers.get('set-cookie')).toMatch(/Max-Age=0/)
  })

  it('rejects an unknown domain in MOCK_DOMAINS', () => {
    expect(() =>
      createMockServer([things], {
        port: 0,
        upstreamUrl,
        domains: ['nope'],
        defaultScenario: undefined,
      }),
    ).toThrow(/Unknown mock domain/)
  })
})

describe('readMockServerConfig', () => {
  it('listens on API_PORT and forwards to the next port by default', () => {
    expect(readMockServerConfig({ API_PORT: '4040' })).toEqual({
      port: 4040,
      upstreamUrl: 'http://localhost:4041',
      domains: undefined,
      defaultScenario: undefined,
    })
  })

  it('reads the domains, the scenario and an explicit upstream', () => {
    expect(
      readMockServerConfig({
        MOCK_DOMAINS: 'chat, knowledge',
        MOCK_SCENARIO: 'slow',
        MOCK_UPSTREAM_URL: 'http://localhost:5000/',
      }),
    ).toMatchObject({
      port: 4000,
      upstreamUrl: 'http://localhost:5000',
      domains: ['chat', 'knowledge'],
      defaultScenario: 'slow',
    })
  })

  it('rejects a port that is not a number', () => {
    expect(() => readMockServerConfig({ API_PORT: 'abc' })).toThrow(/API_PORT/)
  })
})
