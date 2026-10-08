// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { OutboundError } from '@/modules/connections/index.js'
import {
  AGENT_TOOL_TEST_PREVIEW_MAX_LENGTH,
  AGENTS_ERROR_CODES,
  CONNECTIONS_ERROR_CODES,
  connectionDtoSchema,
  discoverMcpActionsDtoSchema,
  ERROR_CODES,
  AGENT_RUNS_ERROR_CODES,
  testAgentToolDtoSchema,
} from '@surefy/contracts'

import { setupAgents, type AgentsSetup } from './agentsTestKit.js'
import { testKey } from '../../../../test/fixtures/fakeAi.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'

import type { FakeHttpCall } from '../../../../test/fixtures/fakeHttp.js'

const SECRET = testKey('tool-routes')

const testBody = (overrides: Record<string, unknown> = {}) => ({
  method: 'GET',
  url: 'https://api.acme.test/orders/{orderId}',
  headers: [],
  connectionId: null,
  arguments: { orderId: '1182' },
  ...overrides,
})

const tryTool = (
  setup: AgentsSetup,
  agentId: string,
  body: unknown,
  who: 'bella' | 'ben' = 'bella',
) => setup.call(who, 'POST', `/${agentId}/tools/test`, body)

async function addConnection(
  setup: AgentsSetup,
  host: string,
  providerKey = 'http',
): Promise<string> {
  setup.http.on(host, { body: {} })
  return expectData(
    await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/connections`, {
      headers: setup.sessionOf(setup.a.members.adam),
      payload: {
        providerKey,
        authType: 'api_key',
        secret: SECRET,
        baseUrl: `https://${host}`,
        name: `Tool ${host}`,
        scope: 'organization',
      },
    }),
    201,
    connectionDtoSchema,
  ).id
}

/** A minimal MCP server over Streamable HTTP that lists the given tools. */
const mcpServer = (tools: Record<string, unknown>[]) => (call: FakeHttpCall) => {
  if (call.request.method === 'DELETE') return { status: 204, text: '' }
  const body = JSON.parse(call.request.body ?? '{}') as { id?: number; method: string }
  const result = (value: unknown) => ({
    text: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: value }),
  })
  switch (body.method) {
    case 'initialize':
      return result({ protocolVersion: '2025-06-18', capabilities: {} })
    case 'notifications/initialized':
      return { status: 202, text: '' }
    case 'tools/list':
      return result({ tools })
    default:
      return { status: 400, text: '' }
  }
}

describe('trying an API tool', () => {
  it('sends the request as it stands and shows the status, the time and the start of the answer', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    setup.http.on('api.acme.test', { body: { id: '1182', status: 'shipped' } })

    const result = expectData(
      await tryTool(setup, agent.id, testBody({ arguments: { orderId: '1182', expand: 'lines' } })),
      200,
      testAgentToolDtoSchema,
    )
    expect(result).toMatchObject({
      ok: true,
      statusCode: 200,
      latencyMs: 12,
      reasonCode: null,
      truncated: false,
    })
    expect(JSON.parse(result.responsePreview ?? '{}')).toEqual({ id: '1182', status: 'shipped' })
    const [call] = setup.http.callsTo('api.acme.test')
    expect(call?.url).toBe('https://api.acme.test/orders/1182?expand=lines')
    expect(call?.request.method).toBe('GET')
  })

  it('sends a body for a method that changes data', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    setup.http.on('api.acme.test', { status: 201, body: { ok: true } })
    const result = expectData(
      await tryTool(
        setup,
        agent.id,
        testBody({
          method: 'POST',
          url: 'https://api.acme.test/refunds',
          arguments: { amount: 5 },
        }),
      ),
      200,
      testAgentToolDtoSchema,
    )
    expect(result).toMatchObject({ ok: true, statusCode: 201 })
    expect(setup.http.callsTo('api.acme.test')[0]?.request.body).toBe('{"amount":5}')
  })

  it('answers an error status as a failed call with the answer', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    setup.http.on('api.acme.test', { status: 404, text: 'No such order' })
    expect(
      expectData(await tryTool(setup, agent.id, testBody()), 200, testAgentToolDtoSchema),
    ).toMatchObject({
      ok: false,
      statusCode: 404,
      reasonCode: AGENTS_ERROR_CODES.AGENT_TOOL_HTTP_ERROR,
      responsePreview: 'No such order',
    })
  })

  it('cuts a long answer and says so', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    setup.http.on('api.acme.test', { text: 'x'.repeat(AGENT_TOOL_TEST_PREVIEW_MAX_LENGTH + 500) })
    const result = expectData(
      await tryTool(setup, agent.id, testBody()),
      200,
      testAgentToolDtoSchema,
    )
    expect(result.truncated).toBe(true)
    expect(result.responsePreview).toHaveLength(AGENT_TOOL_TEST_PREVIEW_MAX_LENGTH)
  })

  it.each([
    ['nothing answers', undefined, CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE],
    [
      'the address may not be called',
      new OutboundError('unsafe', 'blocked'),
      CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED,
    ],
    [
      'the server is too slow',
      new OutboundError('timeout', 'slow'),
      AGENT_RUNS_ERROR_CODES.AGENT_TOOL_TIMEOUT,
    ],
    [
      'the answer is too large',
      new OutboundError('too_large', 'big'),
      AGENTS_ERROR_CODES.AGENT_TOOL_BAD_RESPONSE,
    ],
  ])('is an answer, not an error, when %s', async (_name, failure, code) => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    if (failure !== undefined) setup.http.on('api.acme.test', failure)
    expect(
      expectData(await tryTool(setup, agent.id, testBody()), 200, testAgentToolDtoSchema),
    ).toMatchObject({ ok: false, statusCode: null, latencyMs: null, reasonCode: code })
  })

  it('signs the call with the connection and never shows the credential', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const connectionId = await addConnection(setup, 'api.acme.test')
    setup.http.on('api.acme.test', (call) => ({
      body: { echoed: JSON.stringify(call.request.headers) },
    }))
    const result = expectData(
      await tryTool(setup, agent.id, testBody({ connectionId })),
      200,
      testAgentToolDtoSchema,
    )
    expect(result.ok).toBe(true)
    const sent = setup.http.callsTo('api.acme.test').at(-1)
    expect(JSON.stringify(sent?.request.headers)).toContain(SECRET)
    expect(result.responsePreview).not.toContain(SECRET)
    expect(result.responsePreview).toContain('[redacted]')
  })

  it('does not send a connection to an address it was not made for', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const connectionId = await addConnection(setup, 'api.acme.test')
    setup.http.on('evil.test', { body: {} })
    expect(
      expectData(
        await tryTool(setup, agent.id, testBody({ connectionId, url: 'https://evil.test/x' })),
        200,
        testAgentToolDtoSchema,
      ),
    ).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED,
    })
    expect(setup.http.callsTo('evil.test')).toEqual([])
  })

  it('answers a revoked connection as a failed call, and an unknown one as an error', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const connectionId = await addConnection(setup, 'api.acme.test')
    await request(
      setup.app,
      'POST',
      `/api/v1/orgs/${setup.a.id}/connections/${connectionId}/revoke`,
      {
        headers: setup.sessionOf(setup.a.members.adam),
      },
    )
    expect(
      expectData(
        await tryTool(setup, agent.id, testBody({ connectionId })),
        200,
        testAgentToolDtoSchema,
      ),
    ).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_REVOKED,
    })
    expectError(
      await tryTool(setup, agent.id, testBody({ connectionId: crypto.randomUUID() })),
      404,
      CONNECTIONS_ERROR_CODES.CONNECTION_NOT_FOUND,
    )
  })

  it('asks for the arguments the address needs', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    expectError(
      await tryTool(setup, agent.id, testBody({ arguments: {} })),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expect(setup.http.callsTo('api.acme.test')).toEqual([])
  })

  it('is for people who can edit this agent', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    setup.http.on('api.acme.test', { body: {} })
    expectError(
      await tryTool(setup, agent.id, testBody(), 'ben'),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
    await setup.call('bella', 'PUT', `/${agent.id}/access`, {
      entries: [{ subjectType: 'user', userId: setup.builders.ben.id, level: 'use' }],
    })
    expectError(
      await tryTool(setup, agent.id, testBody(), 'ben'),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await setup.call('uma', 'POST', `/${agent.id}/tools/test`, testBody()),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    await setup.call('bella', 'POST', `/${agent.id}/archive`)
    expectError(
      await tryTool(setup, agent.id, testBody()),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_EDITABLE,
    )
    expect(setup.http.callsTo('api.acme.test')).toEqual([])
  })
})

describe('finding the actions of an MCP server', () => {
  const discover = (setup: AgentsSetup, agentId: string, body: unknown) =>
    setup.call('bella', 'POST', `/${agentId}/tools/discover`, body)
  const server = { serverUrl: 'https://mcp.acme.test/mcp', connectionId: null }

  it('lists what the server offers, every action on and following the tool’s permission', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    setup.http.on(
      'mcp.acme.test',
      mcpServer([
        { name: 'lookup_ticket', description: 'Finds a ticket' },
        { name: 'close_ticket', description: 'Closes it' },
      ]),
    )
    const result = expectData(
      await discover(setup, agent.id, server),
      200,
      discoverMcpActionsDtoSchema,
    )
    expect(result).toMatchObject({ ok: true, reasonCode: null })
    expect(result.actions).toEqual([
      { name: 'lookup_ticket', description: 'Finds a ticket', enabled: true, permission: null },
      { name: 'close_ticket', description: 'Closes it', enabled: true, permission: null },
    ])
  })

  it('answers a server that refuses, or is not an MCP server, with a reason', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    setup.http.on('mcp.acme.test', { status: 401, text: '' })
    expect(
      expectData(await discover(setup, agent.id, server), 200, discoverMcpActionsDtoSchema),
    ).toMatchObject({
      ok: false,
      actions: [],
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    })

    setup.http.on('mcp.acme.test', { status: 200, text: '<html>Welcome</html>' })
    expect(
      expectData(await discover(setup, agent.id, server), 200, discoverMcpActionsDtoSchema),
    ).toMatchObject({ ok: false, reasonCode: AGENTS_ERROR_CODES.AGENT_TOOL_BAD_RESPONSE })

    setup.http.on('mcp.acme.test', new OutboundError('unreachable', 'connect ECONNREFUSED'))
    expect(
      expectData(await discover(setup, agent.id, server), 200, discoverMcpActionsDtoSchema),
    ).toMatchObject({ ok: false, reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE })
  })

  it('opens the server with the connection’s credentials, only on its own address', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const connectionId = await addConnection(setup, 'mcp.acme.test', 'mcp')
    setup.http.on('mcp.acme.test', mcpServer([{ name: 'lookup_ticket' }]))
    expect(
      expectData(
        await discover(setup, agent.id, { ...server, connectionId }),
        200,
        discoverMcpActionsDtoSchema,
      ).ok,
    ).toBe(true)
    expect(JSON.stringify(setup.http.callsTo('mcp.acme.test')[0]?.request.headers)).toContain(
      SECRET,
    )
    expect(
      expectData(
        await discover(setup, agent.id, {
          serverUrl: 'https://other.test/mcp',
          connectionId,
        }),
        200,
        discoverMcpActionsDtoSchema,
      ),
    ).toMatchObject({
      ok: false,
      reasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED,
    })
  })

  it('is for people who can edit this agent', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    expectError(
      await setup.call('ben', 'POST', `/${agent.id}/tools/discover`, server),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
    expectError(
      await setup.call('uma', 'POST', `/${agent.id}/tools/discover`, server),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })
})
