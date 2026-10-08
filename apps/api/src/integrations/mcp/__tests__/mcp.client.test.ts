// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { McpClient, McpError } from '../index.js'

import type { McpHttpRequest, McpHttpResponse, McpSend } from '../index.js'

const SERVER = { url: 'https://mcp.acme.test/mcp', headers: { authorization: 'Bearer t0k3n' } }

interface Seen {
  url: string
  request: McpHttpRequest
  body: { id?: number; method?: string; params?: Record<string, unknown> } | null
}

const json = (body: unknown, headers: Record<string, string> = {}): McpHttpResponse => ({
  status: 200,
  headers: { 'content-type': 'application/json', ...headers },
  text: JSON.stringify(body),
})

/** A server that answers `initialize` and the notification, then whatever `answer` returns. */
function fakeServer(
  answer: (method: string, id: number, params: Record<string, unknown>) => McpHttpResponse,
  options: { sessionId?: string; version?: string } = {},
) {
  const seen: Seen[] = []
  const send: McpSend = (url, request) => {
    const body = request.body === undefined ? null : (JSON.parse(request.body) as Seen['body'])
    seen.push({ url, request, body })
    if (request.method === 'DELETE') return Promise.resolve({ status: 204, headers: {}, text: '' })
    if (body?.method === 'initialize') {
      return Promise.resolve(
        json(
          {
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: options.version ?? '2025-06-18', capabilities: {} },
          },
          options.sessionId === undefined ? {} : { 'mcp-session-id': options.sessionId },
        ),
      )
    }
    if (body?.method === 'notifications/initialized') {
      return Promise.resolve({ status: 202, headers: {}, text: '' })
    }
    return Promise.resolve(answer(body?.method ?? '', body?.id ?? 0, body?.params ?? {}))
  }
  return { send, seen }
}

const client = (send: McpSend) =>
  new McpClient({ send, clientName: 'SurefyOS', clientVersion: '1.2.3' })

describe('the MCP client', () => {
  it('opens a session, lists the tools and closes the session', async () => {
    const { send, seen } = fakeServer(
      (_method, id) =>
        json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'lookup_order',
                description: 'Finds an order',
                inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
                annotations: { readOnlyHint: true, title: 'Look up an order' },
              },
              { name: 'cancel_order' },
              { description: 'no name' },
            ],
          },
        }),
      { sessionId: 'sess-1' },
    )

    const tools = await client(send).listTools(SERVER)

    expect(tools).toEqual([
      {
        name: 'lookup_order',
        description: 'Finds an order',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
        title: 'Look up an order',
        readOnlyHint: true,
        destructiveHint: null,
      },
      {
        name: 'cancel_order',
        description: '',
        inputSchema: { type: 'object', properties: {} },
        title: null,
        readOnlyHint: null,
        destructiveHint: null,
      },
    ])
    expect(seen.map((entry) => entry.body?.method ?? entry.request.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
      'DELETE',
    ])
    // credentials and the session travel on every request after the handshake
    const list = seen[2]
    expect(list?.request.headers).toMatchObject({
      authorization: 'Bearer t0k3n',
      'mcp-session-id': 'sess-1',
      'mcp-protocol-version': '2025-06-18',
      accept: 'application/json, text/event-stream',
    })
    expect(seen[0]?.body?.params).toMatchObject({
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'SurefyOS', version: '1.2.3' },
    })
  })

  it('follows the cursor to the next page of tools', async () => {
    const { send } = fakeServer((_method, id, params) =>
      json({
        jsonrpc: '2.0',
        id,
        result:
          params.cursor === undefined
            ? { tools: [{ name: 'a' }], nextCursor: 'page-2' }
            : { tools: [{ name: 'b' }] },
      }),
    )
    const tools = await client(send).listTools(SERVER)
    expect(tools.map((tool) => tool.name)).toEqual(['a', 'b'])
  })

  it('calls a tool and joins its text, with a placeholder for what is not text', async () => {
    const { send, seen } = fakeServer((_method, id) =>
      json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: 'Order 42 shipped' },
            { type: 'image', data: 'AAAA', mimeType: 'image/png' },
            { type: 'resource', resource: { uri: 'file:///a.txt', text: 'inside' } },
          ],
          structuredContent: { status: 'shipped' },
        },
      }),
    )

    const result = await client(send).callTool(SERVER, 'lookup_order', { id: '42' })

    expect(result).toEqual({
      text: 'Order 42 shipped\n[image: image/png]\ninside',
      structuredContent: { status: 'shipped' },
      isError: false,
    })
    expect(seen.find((entry) => entry.body?.method === 'tools/call')?.body?.params).toEqual({
      name: 'lookup_order',
      arguments: { id: '42' },
    })
    // a server without sessions gets no close request
    expect(seen.some((entry) => entry.request.method === 'DELETE')).toBe(false)
  })

  it('reports a tool that ran and failed as a result, not as an error', async () => {
    const { send } = fakeServer((_method, id) =>
      json({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: 'Order not found' }], isError: true },
      }),
    )
    await expect(client(send).callTool(SERVER, 'lookup_order', {})).resolves.toMatchObject({
      text: 'Order not found',
      isError: true,
    })
  })

  it('reads an answer sent as an event stream and skips the server notifications in it', async () => {
    const { send } = fakeServer((_method, id) => ({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      text: [
        'event: message',
        `data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: {} })}`,
        '',
        'event: message',
        `data: ${JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'hi' }] } })}`,
        '',
      ].join('\r\n'),
    }))
    await expect(client(send).callTool(SERVER, 'greet', {})).resolves.toMatchObject({ text: 'hi' })
  })

  it('turns a JSON-RPC error into an rpc failure with the server code', async () => {
    const { send } = fakeServer((_method, id) =>
      json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool: nope' } }),
    )
    const failure = await client(send)
      .callTool(SERVER, 'nope', {})
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(McpError)
    expect(failure).toMatchObject({ kind: 'rpc', rpcCode: -32602, message: 'Unknown tool: nope' })
  })

  it('names refused credentials and other HTTP failures', async () => {
    const refused: McpSend = () => Promise.resolve({ status: 401, headers: {}, text: '' })
    await expect(client(refused).listTools(SERVER)).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    })
    const broken: McpSend = () => Promise.resolve({ status: 502, headers: {}, text: 'bad gateway' })
    await expect(client(broken).listTools(SERVER)).rejects.toMatchObject({
      kind: 'http',
      status: 502,
    })
  })

  it('refuses a server that is not an MCP server or speaks another version', async () => {
    const html: McpSend = () =>
      Promise.resolve({ status: 200, headers: { 'content-type': 'text/html' }, text: '<html>' })
    await expect(client(html).listTools(SERVER)).rejects.toMatchObject({ kind: 'protocol' })

    const { send } = fakeServer(() => json({}), { version: '2024-11-05' })
    await expect(client(send).listTools(SERVER)).rejects.toMatchObject({ kind: 'unsupported' })
  })

  it('lets the sender fail untouched, and still closes nothing it never opened', async () => {
    const unreachable: McpSend = () => Promise.reject(new Error('connect ECONNREFUSED'))
    await expect(client(unreachable).listTools(SERVER)).rejects.toThrow('connect ECONNREFUSED')
  })
})
