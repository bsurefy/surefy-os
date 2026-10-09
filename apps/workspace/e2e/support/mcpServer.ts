// SPDX-License-Identifier: AGPL-3.0-only
// A stand-in for an MCP server in the end-to-end run, started by Playwright next to the API. It
// speaks Streamable HTTP (one JSON-RPC request per POST, answered as JSON) and offers two actions:
// `lookup_order` (read only) and `cancel_order` (it changes an order). `POST /mcp` is the server;
// `GET /control/calls` lists the actions called so far, so a spec can tell whether a call went out.
import { createServer } from 'node:http'

import { e2e } from './env'

import type { IncomingMessage, ServerResponse } from 'node:http'

const PROTOCOL_VERSION = '2025-06-18'
const SESSION_ID = 'e2e-mcp-session'

interface RpcRequest {
  id?: number | string
  method: string
  params?: { name?: string; arguments?: Record<string, unknown> }
}

const TOOLS = [
  {
    name: 'lookup_order',
    description: 'Looks up the status of an order',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'cancel_order',
    description: 'Cancels an order that has not shipped',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
    },
    annotations: { destructiveHint: true },
  },
]

const calls: { name: string; arguments: Record<string, unknown> }[] = []

function send(response: ServerResponse, status: number, body: unknown, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(body === null ? undefined : JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<RpcRequest> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as RpcRequest
}

function callTool(name: string, args: Record<string, unknown>) {
  calls.push({ name, arguments: args })
  const orderId = typeof args.orderId === 'string' ? args.orderId : ''
  const text =
    name === 'lookup_order' ? `Order ${orderId} shipped to Lisbon` : `Order ${orderId} cancelled`
  return { content: [{ type: 'text', text }], isError: false }
}

async function handleMcp(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'DELETE') {
    send(response, 204, null)
    return
  }
  const message = await readJson(request)
  // notifications carry no id and get no answer
  if (message.id === undefined) {
    send(response, 202, null)
    return
  }
  const answer = (result: unknown) => ({ jsonrpc: '2.0', id: message.id, result })
  switch (message.method) {
    case 'initialize':
      send(
        response,
        200,
        answer({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'E2E MCP server', version: '1.0.0' },
        }),
        { 'mcp-session-id': SESSION_ID },
      )
      return
    case 'tools/list':
      send(response, 200, answer({ tools: TOOLS }))
      return
    case 'tools/call':
      send(
        response,
        200,
        answer(callTool(message.params?.name ?? '', message.params?.arguments ?? {})),
      )
      return
    default:
      send(response, 200, {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Unknown method ${message.method}` },
      })
  }
}

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  if (request.method === 'GET' && path === '/health/live') {
    send(response, 200, { ok: true })
    return
  }
  if (request.method === 'GET' && path === '/control/calls') {
    send(response, 200, calls)
    return
  }
  if (path === '/mcp' && (request.method === 'POST' || request.method === 'DELETE')) {
    handleMcp(request, response).catch((error: unknown) => {
      send(response, 500, { error: String(error) })
    })
    return
  }
  // a server that streams nothing unprompted refuses a GET with 405, which is how a connection
  // check tells that the endpoint exists
  if (path === '/mcp' && request.method === 'GET') {
    send(response, 405, { error: 'This server answers POST only' }, { allow: 'POST, DELETE' })
    return
  }
  send(response, 404, { error: `No route for ${request.method ?? ''} ${path}` })
})

server.listen(e2e.mcpPort, '127.0.0.1')
