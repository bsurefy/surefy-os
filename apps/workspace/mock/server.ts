// SPDX-License-Identifier: AGPL-3.0-only
import { createServer } from 'node:http'

import { getResponse } from 'msw'

import { ERROR_CODES } from '@surefy/contracts'
import {
  configureMockScenarios,
  errorBody,
  isMockContractError,
  parseCookieHeader,
  SCENARIO_COOKIE,
  SCENARIO_RESPONSE_HEADER,
  selectMockDomains,
} from '@surefy/web-core/testing/mock'
import type { MockDomain } from '@surefy/web-core/testing/mock'

import { CONTROL_PATH, controlPage, scenarioCookie } from './controlPage'

import type { MockServerConfig } from './config'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

/** Hop-by-hop headers, and the ones `fetch` already applied when it decoded the body. */
const SKIPPED_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'host',
])
const SCENARIO_PATTERN = /^[a-z][a-z0-9-]{0,39}$/

/** The mock server is a dev CLI: one line per request on stdout. */
export const writeLine = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

export interface MockServer {
  server: Server
  /** The domains answered here and the registered ones forwarded to the real API. */
  mocked: string[]
  passthrough: string[]
}

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
  }
  const method = req.method ?? 'GET'
  let body: ArrayBuffer | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    // Buffered once, so the body can go to a handler or, unmatched, to the real API.
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    body = Uint8Array.from(Buffer.concat(chunks)).buffer
  }
  return new Request(new URL(req.url ?? '/', origin), { method, headers, body })
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie' && !SKIPPED_HEADERS.has(name)) headers[name] = value
  })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) headers['set-cookie'] = cookies
  res.writeHead(response.status, headers)
  if (response.body) {
    // Written chunk by chunk, so streamed answers (SSE) arrive as they are produced.
    for await (const chunk of response.body) res.write(chunk)
  }
  res.end()
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(errorBody(code, message)))
}

async function forward(request: Request, upstreamUrl: string): Promise<Response> {
  const url = new URL(request.url)
  const headers = new Headers()
  request.headers.forEach((value, name) => {
    if (!SKIPPED_HEADERS.has(name)) headers.set(name, value)
  })
  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer()
  return fetch(`${upstreamUrl}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
  })
}

/** The request's own origin; the mock server serves plain HTTP on localhost. */
const originOf = (req: IncomingMessage) => `http://${req.headers.host ?? 'localhost'}`

function handleControl(
  req: IncomingMessage,
  res: ServerResponse,
  server: MockServer,
  config: MockServerConfig,
): void {
  const url = new URL(req.url ?? '/', originOf(req))
  if (url.pathname === `${CONTROL_PATH}/scenario`) {
    const requested = url.searchParams.get('set') ?? 'default'
    const scenario = SCENARIO_PATTERN.test(requested) ? requested : 'default'
    res.writeHead(303, { location: CONTROL_PATH, 'set-cookie': scenarioCookie(scenario) })
    res.end()
    return
  }
  const current = parseCookieHeader(req.headers.cookie ?? null)[SCENARIO_COOKIE]
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(
    controlPage({
      current,
      mocked: server.mocked,
      passthrough: server.passthrough,
      upstreamUrl: config.upstreamUrl,
    }),
  )
}

/**
 * The dev mock server (testing.md §5): an HTTP server on the API port that answers the mocked
 * domains with their MSW handlers and forwards everything else to the real API.
 */
export function createMockServer(
  domains: readonly MockDomain[],
  config: MockServerConfig,
  log: (line: string) => void = writeLine,
): MockServer {
  const { mocked, passthrough } = selectMockDomains(domains, config.domains)
  if (config.defaultScenario !== undefined) {
    configureMockScenarios({ defaultScenario: config.defaultScenario })
  }
  const handlers = mocked.flatMap((domain) => [...domain.handlers])
  const mockServer: MockServer = {
    server: createServer(),
    mocked: mocked.map((domain) => domain.name),
    passthrough,
  }

  mockServer.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const started = Date.now()
      const target = `${req.method ?? 'GET'} ${req.url ?? '/'}`
      if ((req.url ?? '').startsWith(CONTROL_PATH)) {
        handleControl(req, res, mockServer, config)
        return
      }
      try {
        const request = await toRequest(req, originOf(req))
        const mockedResponse = await getResponse(handlers, request)
        if (mockedResponse?.type === 'error') {
          req.socket.destroy() // the `offline` scenario: the connection just drops
          log(`${target} → offline (mock)`)
          return
        }
        if (mockedResponse) {
          await send(res, mockedResponse)
          const scenario = mockedResponse.headers.get(SCENARIO_RESPONSE_HEADER) ?? 'default'
          log(`${target} → ${mockedResponse.status} mock:${scenario} ${Date.now() - started}ms`)
          return
        }
        let upstream: Response
        try {
          upstream = await forward(request, config.upstreamUrl)
        } catch {
          sendError(
            res,
            502,
            ERROR_CODES.SERVICE_UNAVAILABLE,
            `Mock server: the real API at ${config.upstreamUrl} is not reachable`,
          )
          log(`${target} → 502 upstream unreachable`)
          return
        }
        await send(res, upstream)
        log(`${target} → ${upstream.status} upstream ${Date.now() - started}ms`)
      } catch (error) {
        if (isMockContractError(error)) {
          process.stderr.write(`\n\u001B[31m${error.message}\u001B[0m\n\n`)
          res.setHeader('x-mock-contract-error', 'true')
          sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, error.message)
          return
        }
        process.stderr.write(
          `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        )
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Mock server failure')
      }
    })()
  })
  return mockServer
}
