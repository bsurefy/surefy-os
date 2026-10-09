// SPDX-License-Identifier: AGPL-3.0-only
// A stand-in for an app's OAuth 2 server in the end-to-end run, started by Playwright next to the
// API. A custom API connection signs in to it with the client credentials flow: `POST /oauth/token`
// trades the client ID and secret for an access token, and `GET /api` accepts only a token it
// issued. `POST /control/revoke` makes every token issued so far stop working, as an app that
// expired a sign-in does; `GET /control/stats` counts what was issued and checked.
// It is also the target of an agent's API tool: `POST /api/refunds` records the refund it is asked
// for and `GET /control/refunds` lists them, so a spec can tell whether a call really went out.
import { createServer } from 'node:http'

import { e2e, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } from './env'

import type { IncomingMessage, ServerResponse } from 'node:http'

const TOKEN_LIFETIME_SECONDS = 3600

const valid = new Set<string>()
let issued = 0
let accepted = 0
let rejected = 0
const refunds: unknown[] = []

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function bearerOf(request: IncomingMessage): string | null {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
}

/** The client ID and secret of a `Basic` header, or null. */
function clientOf(request: IncomingMessage): { id: string; secret: string } | null {
  const header = request.headers.authorization ?? ''
  if (!header.startsWith('Basic ')) return null
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
  const at = decoded.indexOf(':')
  return at === -1 ? null : { id: decoded.slice(0, at), secret: decoded.slice(at + 1) }
}

async function readBody(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

async function issueToken(request: IncomingMessage, response: ServerResponse) {
  const client = clientOf(request)
  const body = await readBody(request)
  if (client?.id !== OAUTH_CLIENT_ID || client.secret !== OAUTH_CLIENT_SECRET) {
    send(response, 401, { error: 'invalid_client', error_description: 'Unknown client' })
    return
  }
  if (body.get('grant_type') !== 'client_credentials') {
    send(response, 400, { error: 'unsupported_grant_type' })
    return
  }
  issued += 1
  const token = `e2e-token-${String(issued)}`
  valid.add(token)
  send(response, 200, {
    access_token: token,
    token_type: 'Bearer',
    expires_in: TOKEN_LIFETIME_SECONDS,
    scope: body.get('scope') ?? '',
  })
}

function checkToken(request: IncomingMessage, response: ServerResponse) {
  const token = bearerOf(request)
  if (token !== null && valid.has(token)) {
    accepted += 1
    send(response, 200, { ok: true })
  } else {
    rejected += 1
    send(response, 401, { error: 'invalid_token' })
  }
}

async function refund(request: IncomingMessage, response: ServerResponse) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as object
  refunds.push(body)
  send(response, 200, { refunded: true, ...body })
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  if (request.method === 'GET' && path === '/health/live') {
    send(response, 200, { ok: true })
  } else if (request.method === 'POST' && path === '/oauth/token') {
    issueToken(request, response).catch((error: unknown) => {
      send(response, 500, { error: String(error) })
    })
  } else if (request.method === 'GET' && path === '/api') {
    checkToken(request, response)
  } else if (request.method === 'POST' && path === '/api/refunds') {
    refund(request, response).catch((error: unknown) => {
      send(response, 500, { error: String(error) })
    })
  } else if (request.method === 'GET' && path === '/control/refunds') {
    send(response, 200, refunds)
  } else if (request.method === 'POST' && path === '/control/revoke') {
    valid.clear()
    send(response, 200, { ok: true })
  } else if (request.method === 'GET' && path === '/control/stats') {
    send(response, 200, { issued, accepted, rejected })
  } else {
    send(response, 404, { error: `No route for ${request.method ?? ''} ${path}` })
  }
})

server.listen(e2e.oauthPort, '127.0.0.1')
