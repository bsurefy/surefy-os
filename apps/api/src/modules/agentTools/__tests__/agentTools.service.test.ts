// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { ConflictError } from '@/core/errors/index.js'
import { AGENT_RUNS_ERROR_CODES, CONNECTIONS_ERROR_CODES } from '@surefy/contracts'

import {
  apiTool,
  buildTools,
  connectionUse,
  CTX,
  fakeConnections,
  fakeHttp,
  mcpTool,
  outboundFailure,
  reply,
  TOKEN,
} from './agentToolsTestKit.js'

import type { ResolvedTool } from '../agentTools.types.js'

const only = async (
  tools: ReturnType<typeof buildTools>['service'],
  definition: Parameters<ReturnType<typeof buildTools>['service']['resolve']>[1][number],
): Promise<ResolvedTool> => {
  const [resolved] = await tools.resolve(CTX, [definition])
  if (resolved === undefined) throw new Error('nothing resolved')
  return resolved
}

describe('resolving tools for the model', () => {
  it('offers an enabled API tool with a schema made from the path placeholders', async () => {
    const { http } = fakeHttp(() => reply(200, '{}'))
    const { service } = buildTools(http, fakeConnections().connections)

    const resolved = await service.resolve(CTX, [
      apiTool(),
      apiTool({ name: 'Off', enabled: false }),
    ])

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      callName: 'Orders_API',
      kind: 'api',
      label: 'Orders API',
      action: 'Orders API',
      permission: 'read_only',
      inputSchema: {
        type: 'object',
        properties: { orderId: { type: 'string' } },
        required: ['orderId'],
      },
    })
  })

  it('keeps the schema the builder wrote', async () => {
    const schema = { type: 'object', properties: { q: { type: 'string' } } }
    const { http } = fakeHttp(() => reply(200, '{}'))
    const { service } = buildTools(http, fakeConnections().connections)
    const resolved = await only(service, apiTool({ inputSchema: schema }))
    expect(resolved.inputSchema).toEqual(schema)
  })

  it('offers one function per enabled MCP action, with the arguments the server declares', async () => {
    const { http } = fakeHttp(
      mcpServer({
        tools: [
          {
            name: 'lookup_ticket',
            description: 'Finds a ticket',
            inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
          },
          { name: 'close_ticket', inputSchema: { type: 'object' } },
        ],
      }),
    )
    const { service } = buildTools(http, fakeConnections().connections)

    const resolved = await service.resolve(CTX, [mcpTool()])

    expect(resolved.map((item) => item.callName)).toEqual([
      'Support__lookup_ticket',
      'Support__close_ticket',
    ])
    expect(resolved[0]).toMatchObject({
      label: 'Support › lookup_ticket',
      toolName: 'Support',
      action: 'Support.lookup_ticket',
      actionName: 'lookup_ticket',
      description: 'Finds a ticket',
      permission: 'read_only',
      inputSchema: { properties: { id: { type: 'string' } } },
    })
    // an action's own permission wins over the server tool's
    expect(resolved[1]).toMatchObject({ description: 'Closes it', permission: 'can_act' })
  })

  it('never runs a destructive action as Read only', async () => {
    const { http } = fakeHttp(
      mcpServer({
        tools: [
          { name: 'lookup_ticket', annotations: { readOnlyHint: true } },
          { name: 'close_ticket', annotations: { destructiveHint: true } },
        ],
      }),
    )
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = mcpTool({
      discoveredActions: [
        { name: 'lookup_ticket', description: '', enabled: true, permission: null },
        { name: 'close_ticket', description: '', enabled: true, permission: null },
      ],
    })

    const resolved = await service.resolve(CTX, [tool])

    expect(
      resolved.map((item) => [item.actionName, item.permission, item.declaredPermission]),
    ).toEqual([
      ['lookup_ticket', 'read_only', 'read_only'],
      ['close_ticket', 'ask_first', 'read_only'],
    ])
  })

  it('still offers the actions of a server that cannot be reached now', async () => {
    const { http } = fakeHttp(() => outboundFailure('unreachable', 'connect ECONNREFUSED'))
    const { service } = buildTools(http, fakeConnections().connections)

    const resolved = await service.resolve(CTX, [mcpTool()])

    expect(resolved.map((item) => item.actionName)).toEqual(['lookup_ticket', 'close_ticket'])
    expect(resolved[0]?.inputSchema).toEqual({ type: 'object', additionalProperties: true })
  })

  it('remembers what a server declared between runs', async () => {
    const { http, sent } = fakeHttp(mcpServer({ tools: [{ name: 'lookup_ticket' }] }))
    const { service } = buildTools(http, fakeConnections().connections)

    await service.resolve(CTX, [mcpTool()])
    const requests = sent.length
    await service.resolve(CTX, [mcpTool()])

    expect(sent).toHaveLength(requests)
  })

  it('gives two tools with the same name two functions', async () => {
    const { http } = fakeHttp(() => reply(200, '{}'))
    const { service } = buildTools(http, fakeConnections().connections)
    const resolved = await service.resolve(CTX, [apiTool(), apiTool()])
    expect(resolved.map((item) => item.callName)).toEqual(['Orders_API', 'Orders_API_2'])
  })

  it('leaves the tools of other adapters to them', async () => {
    const { http } = fakeHttp(() => reply(200, '{}'))
    const { service } = buildTools(http, fakeConnections().connections)
    const resolved = await service.resolve(CTX, [
      {
        id: crypto.randomUUID(),
        kind: 'web_search',
        name: 'Web',
        description: '',
        permission: 'read_only',
        enabled: true,
      },
    ])
    expect(resolved).toEqual([])
  })
})

describe('calling an API tool', () => {
  it('fills the path and sends the other arguments as the query of a GET', async () => {
    const { http, sent } = fakeHttp(() => reply(200, '{"status":"shipped"}'))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool({ headers: [{ name: 'X-Team', value: 'support' }] }))

    const outcome = await service.execute(CTX, tool, {
      orderId: 'A/1 2',
      expand: ['items', 'notes'],
      full: true,
    })

    expect(sent[0]).toMatchObject({
      url: 'https://api.acme.test/orders/A%2F1%202?expand=items&expand=notes&full=true',
      method: 'GET',
      headers: { 'x-team': 'support' },
    })
    expect(outcome).toMatchObject({
      ok: true,
      content: '{"status":"shipped"}',
      data: { status: 'shipped' },
      truncated: false,
      target: 'GET https://api.acme.test/orders/A%2F1%202',
      attempts: 1,
    })
  })

  it('sends the arguments of a POST as a JSON body', async () => {
    const { http, sent } = fakeHttp(() => reply(201, '{"id":7}'))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(
      service,
      apiTool({ method: 'POST', permission: 'can_act', url: 'https://api.acme.test/refunds' }),
    )

    await service.execute(CTX, tool, { orderId: 'A1', amount: 20 })

    expect(sent[0]?.body).toBe('{"orderId":"A1","amount":20}')
    expect(sent[0]?.headers['content-type']).toBe('application/json')
  })

  it('tells the model what is missing instead of calling', async () => {
    const { http, sent } = fakeHttp(() => reply(200, '{}'))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool())

    const outcome = await service.execute(CTX, tool, {})
    expect(outcome).toMatchObject({
      ok: false,
      code: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
      message: 'Missing argument "orderId"',
    })

    const dots = await service.execute(CTX, tool, { orderId: '..' })
    expect(dots).toMatchObject({ ok: false, message: 'Missing or invalid argument "orderId"' })
    expect(sent).toHaveLength(0)
  })

  it('refuses a Read only tool that would write', async () => {
    const { http, sent } = fakeHttp(() => reply(200, '{}'))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool({ method: 'DELETE', permission: 'read_only' }))

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    expect(outcome).toMatchObject({ ok: false, code: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED })
    expect(outcome.ok ? '' : outcome.message).toContain('Read only')
    expect(sent).toHaveLength(0)
  })

  it('signs the call with the connection and masks the credential in what comes back', async () => {
    const connection = connectionUse()
    const { http, sent } = fakeHttp(() =>
      reply(200, JSON.stringify({ echo: `Bearer ${TOKEN}`, note: TOKEN })),
    )
    const { service } = buildTools(
      http,
      fakeConnections({ [connection.id]: connection }).connections,
    )
    const tool = await only(
      service,
      apiTool({
        connectionId: connection.id,
        headers: [{ name: 'Authorization', value: 'Bearer nope' }],
      }),
    )

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    // the connection's credential replaces any header of the same name in the tool
    expect(sent[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(outcome.ok).toBe(true)
    expect(JSON.stringify(outcome)).not.toContain(TOKEN)
    expect(outcome).toMatchObject({ data: { echo: '[redacted]', note: '[redacted]' } })
  })

  it('does not hand a connection to a server it was not made for', async () => {
    const connection = connectionUse({ baseUrl: 'https://other.example' })
    const slack = connectionUse({ providerKey: 'slack' })
    const { http, sent } = fakeHttp(() => reply(200, '{}'))
    const { service } = buildTools(
      http,
      fakeConnections({ [connection.id]: connection, [slack.id]: slack }).connections,
    )

    for (const id of [connection.id, slack.id]) {
      const tool = await only(service, apiTool({ connectionId: id }))
      const outcome = await service.execute(CTX, tool, { orderId: 'A1' })
      expect(outcome).toMatchObject({
        ok: false,
        message: 'This connection cannot be used with this address',
      })
    }
    expect(sent).toHaveLength(0)
  })

  it('fails with the code of a connection that cannot be used', async () => {
    const expired = new ConflictError(
      CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
      'The sign-in expired',
    )
    const id = crypto.randomUUID()
    const { http, sent } = fakeHttp(() => reply(200, '{}'))
    const { service } = buildTools(http, fakeConnections({ [id]: expired }).connections)
    const tool = await only(service, apiTool({ connectionId: id }))

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    expect(outcome).toMatchObject({
      ok: false,
      code: 'CONNECTION_TOKEN_EXPIRED',
      message: 'The sign-in expired',
    })
    expect(sent).toHaveLength(0)
  })

  it('reports an HTTP error with an excerpt of the answer, and a redirect as a failure', async () => {
    const answers = [
      reply(404, '{"error":"no such order"}'),
      reply(302, '', { location: 'https://elsewhere.test' }),
    ]
    const { http } = fakeHttp(() => answers.shift() ?? reply(500, ''))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool())

    const missing = await service.execute(CTX, tool, { orderId: 'A1' })
    expect(missing).toMatchObject({
      ok: false,
      code: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
      message: 'The server answered HTTP 404',
    })
    expect(missing.ok ? '' : missing.content).toContain('no such order')

    const moved = await service.execute(CTX, tool, { orderId: 'A1' })
    expect(moved).toMatchObject({ ok: false })
    expect(moved.ok ? '' : moved.message).toContain('redirects')
  })

  it('cuts an answer longer than the model reads', async () => {
    const { http } = fakeHttp(() =>
      reply(200, 'x'.repeat(40_000), { 'content-type': 'text/plain' }),
    )
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool())

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    expect(outcome).toMatchObject({ ok: true, truncated: true, data: null })
    expect(outcome.ok ? outcome.content.length : 0).toBe(32_000)
  })

  it('names an address the safe client refuses', async () => {
    const { http } = fakeHttp(() => outboundFailure('unsafe', 'private addresses are not called'))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool())
    await expect(service.execute(CTX, tool, { orderId: 'A1' })).resolves.toMatchObject({
      ok: false,
      message: 'This address cannot be called from SurefyOS',
      attempts: 1,
    })
  })

  it('stops waiting after the deadline of a call', async () => {
    const { http } = fakeHttp(
      () =>
        new Promise(() => {
          // never answers
        }),
    )
    const { service } = buildTools(http, fakeConnections().connections, 20)
    const tool = await only(service, apiTool({ permission: 'can_act' }))

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    expect(outcome).toMatchObject({ ok: false, code: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_TIMEOUT })
  })
})

describe('retrying a call', () => {
  it('repeats a Read only tool after a transient failure', async () => {
    const { http, sent } = fakeHttp((_request, call) =>
      call < 3 ? reply(503, 'busy') : reply(200, '{"ok":true}'),
    )
    const { service, slept } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool())

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    expect(outcome).toMatchObject({ ok: true, attempts: 3 })
    expect(sent).toHaveLength(3)
    expect(slept).toEqual([1000, 4000])
  })

  it('gives up after two retries', async () => {
    const { http, sent } = fakeHttp(() => reply(503, 'busy'))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool())

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    expect(outcome).toMatchObject({ ok: false, attempts: 3 })
    expect(sent).toHaveLength(3)
  })

  it('never repeats a call that acts and may have arrived', async () => {
    const { http, sent } = fakeHttp(() => reply(503, 'busy'))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool({ method: 'POST', permission: 'can_act' }))

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    expect(outcome).toMatchObject({ ok: false, attempts: 1 })
    expect(sent).toHaveLength(1)
  })

  it('repeats any call when the connection could not even be made', async () => {
    const { http, sent } = fakeHttp((_request, call) =>
      call === 1
        ? outboundFailure('unreachable', 'connect ECONNREFUSED 10.0.0.1:443')
        : reply(200, '{}'),
    )
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool({ method: 'POST', permission: 'ask_first' }))

    const outcome = await service.execute(CTX, tool, { orderId: 'A1' })

    expect(outcome).toMatchObject({ ok: true, attempts: 2 })
    expect(sent).toHaveLength(2)
  })

  it('does not repeat a call that failed for its own reasons', async () => {
    const { http, sent } = fakeHttp(() => reply(400, 'bad request'))
    const { service } = buildTools(http, fakeConnections().connections)
    const tool = await only(service, apiTool())
    await service.execute(CTX, tool, { orderId: 'A1' })
    expect(sent).toHaveLength(1)
  })
})

/** A scripted MCP server: the handshake, and `tools/list` and `tools/call` from the options. */
function mcpServer(options: {
  tools?: Record<string, unknown>[]
  call?: (name: string, args: Record<string, unknown>) => Record<string, unknown>
}) {
  return (request: { body: string | undefined; method: string }) => {
    if (request.method === 'DELETE') return reply(204, '')
    const body = JSON.parse(request.body ?? '{}') as {
      id?: number
      method: string
      params?: Record<string, unknown>
    }
    const result = (value: unknown) =>
      reply(200, JSON.stringify({ jsonrpc: '2.0', id: body.id, result: value }))
    switch (body.method) {
      case 'initialize':
        return result({ protocolVersion: '2025-06-18', capabilities: {} })
      case 'notifications/initialized':
        return reply(202, '')
      case 'tools/list':
        return result({ tools: options.tools ?? [] })
      case 'tools/call':
        return result(
          options.call?.(
            String(body.params?.name),
            (body.params?.arguments ?? {}) as Record<string, unknown>,
          ) ?? {},
        )
      default:
        return reply(400, '')
    }
  }
}

describe('calling an MCP action', () => {
  it('calls the action on the server with the arguments and signs the call', async () => {
    const connection = connectionUse({ providerKey: 'mcp', baseUrl: 'https://mcp.acme.test' })
    const calls: unknown[] = []
    const { http, sent } = fakeHttp(
      mcpServer({
        tools: [{ name: 'lookup_ticket' }],
        call: (name, args) => {
          calls.push({ name, args })
          return {
            content: [{ type: 'text', text: `Ticket ${String(args.id)} is open (${TOKEN})` }],
          }
        },
      }),
    )
    const { service } = buildTools(
      http,
      fakeConnections({ [connection.id]: connection }).connections,
    )
    const [lookup] = await service.resolve(CTX, [mcpTool({ connectionId: connection.id })])
    if (lookup === undefined) throw new Error('nothing resolved')

    const outcome = await service.execute(CTX, lookup, { id: 'T-9' })

    expect(calls).toEqual([{ name: 'lookup_ticket', args: { id: 'T-9' } }])
    expect(sent.every((request) => request.headers.authorization === `Bearer ${TOKEN}`)).toBe(true)
    expect(outcome).toMatchObject({
      ok: true,
      content: 'Ticket T-9 is open ([redacted])',
      target: 'MCP lookup_ticket @ https://mcp.acme.test',
    })
  })

  it('reports an action that ran and failed as a failed call with the server’s text', async () => {
    const { http } = fakeHttp(
      mcpServer({
        call: () => ({
          content: [{ type: 'text', text: 'Ticket is already closed' }],
          isError: true,
        }),
      }),
    )
    const { service } = buildTools(http, fakeConnections().connections)
    const [lookup] = await service.resolve(CTX, [mcpTool()])
    if (lookup === undefined) throw new Error('nothing resolved')

    const outcome = await service.execute(CTX, lookup, {})

    expect(outcome).toMatchObject({
      ok: false,
      code: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
      content: 'Ticket is already closed',
      attempts: 1,
    })
  })

  it('names a server that refuses the credentials', async () => {
    const { http } = fakeHttp(() => reply(401, ''))
    const { service } = buildTools(http, fakeConnections().connections)
    const [lookup] = await service.resolve(CTX, [mcpTool()])
    if (lookup === undefined) throw new Error('nothing resolved')

    const outcome = await service.execute(CTX, lookup, {})

    expect(outcome).toMatchObject({
      ok: false,
      code: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    })
  })

  it('repeats a Read only action after a server error, but not an action that acts', async () => {
    let calls = 0
    const { http } = fakeHttp((request) => {
      const body = JSON.parse(request.body ?? '{}') as { method?: string; id?: number }
      if (body.method === 'tools/call') {
        calls += 1
        return reply(503, 'busy')
      }
      return mcpServer({})(request)
    })
    const { service } = buildTools(http, fakeConnections().connections)
    const [lookup, close] = await service.resolve(CTX, [mcpTool()])
    if (lookup === undefined || close === undefined) throw new Error('nothing resolved')

    await service.execute(CTX, lookup, {})
    expect(calls).toBe(3)

    calls = 0
    await service.execute(CTX, close, {})
    expect(calls).toBe(1)
  })
})

describe('discovering the actions of a server', () => {
  it('lists what the server offers and keeps the builder’s switches', async () => {
    const { http } = fakeHttp(
      mcpServer({
        tools: [{ name: 'lookup_ticket', description: 'Finds a ticket' }, { name: 'new_action' }],
      }),
    )
    const { service } = buildTools(http, fakeConnections().connections)

    const result = await service.discoverMcpActions(CTX, {
      serverUrl: 'https://mcp.acme.test/mcp',
      connectionId: null,
      previous: [
        { name: 'lookup_ticket', description: 'Mine', enabled: false, permission: 'ask_first' },
        { name: 'gone', description: '', enabled: true, permission: null },
      ],
    })

    expect(result).toEqual({
      ok: true,
      actions: [
        { name: 'lookup_ticket', description: 'Mine', enabled: false, permission: 'ask_first' },
        { name: 'new_action', description: '', enabled: true, permission: null },
      ],
    })
  })

  it('says why a server could not be read', async () => {
    const { http } = fakeHttp(() => reply(401, ''))
    const { service } = buildTools(http, fakeConnections().connections)
    await expect(
      service.discoverMcpActions(CTX, {
        serverUrl: 'https://mcp.acme.test/mcp',
        connectionId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    })
  })

  it('asks the server again when refreshing, whatever was remembered', async () => {
    const { http, sent } = fakeHttp(mcpServer({ tools: [{ name: 'a' }] }))
    const { service } = buildTools(http, fakeConnections().connections)
    const server = { serverUrl: 'https://mcp.acme.test/mcp', connectionId: null }

    await service.discoverMcpActions(CTX, server)
    const first = sent.length
    await service.discoverMcpActions(CTX, server)

    expect(sent).toHaveLength(first * 2)
  })
})
