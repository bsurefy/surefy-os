// SPDX-License-Identifier: AGPL-3.0-only
// A stand-in for a SearXNG instance in the end-to-end run, started by Playwright next to the API.
// `GET /search?q=...&format=json` answers three results that quote the query, as SearXNG's JSON
// output does. `POST /control/mode` with `{ "mode": "down" }` makes it answer 403, as an instance
// whose JSON format is switched off does; `GET /control/queries` lists the queries it was asked,
// so a spec can tell what left the install.
import { createServer } from 'node:http'

import { e2e } from './env'

import type { IncomingMessage, ServerResponse } from 'node:http'

const queries: string[] = []
let mode: 'up' | 'down' = 'up'

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
}

function search(url: URL, response: ServerResponse) {
  if (mode === 'down') {
    send(response, 403, { error: 'format not allowed' })
    return
  }
  const q = url.searchParams.get('q') ?? ''
  // the connection test asks for a word of its own; only questions count as queries of a chat
  queries.push(q)
  send(response, 200, {
    query: q,
    results: [1, 2, 3].map((index) => ({
      title: `Stub result ${String(index)}`,
      url: `https://stub.example.test/result-${String(index)}`,
      content: `Result ${String(index)} for ${q}`,
    })),
  })
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const { pathname } = url
  if (request.method === 'GET' && pathname === '/health/live') {
    send(response, 200, { ok: true })
  } else if (request.method === 'GET' && pathname === '/search') {
    search(url, response)
  } else if (request.method === 'GET' && pathname === '/control/queries') {
    send(response, 200, queries)
  } else if (request.method === 'DELETE' && pathname === '/control/queries') {
    queries.length = 0
    send(response, 200, [])
  } else if (request.method === 'POST' && pathname === '/control/mode') {
    readJson(request)
      .then((body) => {
        mode = body.mode === 'down' ? 'down' : 'up'
        send(response, 200, { mode })
      })
      .catch((error: unknown) => {
        send(response, 500, { error: String(error) })
      })
  } else {
    send(response, 404, { error: `No route for ${request.method ?? ''} ${pathname}` })
  }
})

server.listen(e2e.searchPort, '127.0.0.1')
