// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { orgKey } from '@/core/cache/keys.js'
import { agentChannels, agentRuns } from '@/database/tables/index.js'
import { auditLogs } from '@/database/tables/partitioned/audit.tables.js'
import {
  agentChannelCreatedDtoSchema,
  agentChannelDtoSchema,
  agentChannelListDtoSchema,
  agentDetailDtoSchema,
  AGENT_RUNS_ERROR_CODES,
  AGENTS_ERROR_CODES,
  ERROR_CODES,
  WIDGET_CONVERSATION_HEADER,
  WIDGET_SCRIPT_PATH,
  WIDGET_TOKEN_HEADER,
  WIDGET_TOKEN_PATTERN,
  widgetConfigDtoSchema,
} from '@surefy/contracts'
import type { WidgetChannelConfig } from '@surefy/contracts'

import { TEST_API_HOST } from '../../../../test/helpers/auth.js'
import { expectData, expectError, request } from '../../../../test/helpers/request.js'
import { setupAgents, type AgentsSetup } from '../../agents/__tests__/agentsTestKit.js'

const SHOP = 'https://shop.example.com'
const CONVERSATION = '0198f2c0-0000-4000-8000-0000000000c1'

const widgetConfig: WidgetChannelConfig = {
  allowedOrigins: [`${SHOP}/`],
  greeting: 'Hi! Ask me about orders.',
  theme: 'light',
  position: 'bottom_left',
}

/** Polls until the check finds something: the request under test runs concurrently. */
async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = await check()
    if (found !== undefined) return found
    if (Date.now() > deadline) throw new Error('waited too long')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** An agent of Bella's with conversation starters, published by Adam with the widget on. */
async function publishedWithWidget(setup: AgentsSetup) {
  const agent = await setup.create('bella', { name: 'Order help' })
  const revision = await setup.saveDraft('bella', agent, agent.draft.revision, {
    ...agent.draft.definition,
    conversationStarters: ['Where is my order?'],
  })
  const result = await setup.publish('adam', agent.id, {
    baseRevision: revision,
    channels: [{ type: 'widget', config: widgetConfig }],
  })
  const channel = result.channels.find((candidate) => candidate.type === 'widget')
  if (channel === undefined) throw new Error('no widget channel')
  const token = result.widgetTokens[channel.id]
  if (token === undefined) throw new Error('no widget token')
  return { agent, channel, token }
}

const widgetHeaders = (token: string, origin: string | null = SHOP) => ({
  [WIDGET_TOKEN_HEADER]: token,
  ...(origin === null ? {} : { origin }),
})

const widget = (
  setup: AgentsSetup,
  method: 'GET' | 'POST',
  path: string,
  headers: Record<string, string>,
  payload?: unknown,
) =>
  request(setup.app, method, `/api/v1/widget${path}`, {
    headers,
    ...(payload === undefined ? {} : { payload }),
  })

const message = (text = 'Where is order 1182?') => ({
  conversationId: CONVERSATION,
  messages: [{ role: 'user', text }],
})

const channelsUrl = (agentId: string, path = '') => `/${agentId}/channels${path}`

/** The widget's events in a finished stream. */
const eventsOf = (body: string) =>
  body
    .split('\n\n')
    .filter((frame) => frame.startsWith('event: '))
    .map((frame) => {
      const lines = frame.split('\n')
      const value = (name: string) =>
        lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2)
      return { event: value('event'), data: JSON.parse(value('data') ?? 'null') as unknown }
    })

/** Sends a message and cancels the run it starts, so the stream ends. */
async function sendAndEnd(setup: AgentsSetup, agentId: string, token: string) {
  const known = new Set(
    (
      await setup.db.system('test', (tx) =>
        tx.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)),
      )
    ).map((row) => row.id),
  )
  const sending = widget(setup, 'POST', '/messages', widgetHeaders(token), message())
  const run = await waitFor(async () => {
    const rows = await setup.db.system('test', (tx) =>
      tx.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)),
    )
    return rows.find((row) => !known.has(row.id))
  })
  await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/runs/${run.id}/cancel`, {
    headers: setup.sessionOf(setup.a.members.adam),
  })
  return { response: await sending, run }
}

describe('widget channels', () => {
  it('get a token once when an Admin publishes, and keep it when the agent is published again', async () => {
    const setup = await setupAgents()
    const { agent, channel, token } = await publishedWithWidget(setup)
    expect(token).toMatch(WIDGET_TOKEN_PATTERN)
    expect(channel).toMatchObject({
      status: 'active',
      config: { widget: widgetConfig },
      publicTokenPrefix: token.slice(0, 11),
    })

    const detail = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    const again = await setup.publish('adam', agent.id, {
      baseRevision: detail.draft.revision,
      channels: [{ type: 'widget', config: { ...widgetConfig, theme: 'dark' } }],
    })
    expect(again.widgetTokens).toEqual({})
    expectData(
      await widget(setup, 'GET', '/config', widgetHeaders(token)),
      200,
      widgetConfigDtoSchema,
    )
  })

  it('are listed without their token, and created, changed, paused and resumed by an Admin', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await setup.publish('bella', agent.id, { baseRevision: agent.draft.revision, channels: [] })

    const created = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id), {
        type: 'widget',
        config: widgetConfig,
      }),
      201,
      agentChannelCreatedDtoSchema,
    )
    expect(created.token).toMatch(WIDGET_TOKEN_PATTERN)
    expectError(
      await setup.call('adam', 'POST', channelsUrl(agent.id), {
        type: 'widget',
        config: widgetConfig,
      }),
      409,
      AGENTS_ERROR_CODES.AGENT_CHANNEL_EXISTS,
    )

    const list = expectData(
      await setup.call('bella', 'GET', channelsUrl(agent.id)),
      200,
      agentChannelListDtoSchema,
    )
    expect(list.items.map((item) => item.type).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'widget',
      'workspace_chat',
    ])
    expect(JSON.stringify(list)).not.toContain(created.token)

    const id = created.channel.id
    const updated = expectData(
      await setup.call('adam', 'PATCH', channelsUrl(agent.id, `/${id}`), {
        widget: { ...widgetConfig, greeting: 'Hello' },
      }),
      200,
      agentChannelDtoSchema,
    )
    expect(updated.config.widget?.greeting).toBe('Hello')
    expectError(
      await setup.call('adam', 'PATCH', channelsUrl(agent.id, `/${id}`), {
        api: { rateLimitPerMinute: 5 },
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )

    const paused = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id, `/${id}/pause`)),
      200,
      agentChannelDtoSchema,
    )
    expect(paused.status).toBe('paused')
    expectError(
      await widget(setup, 'GET', '/config', widgetHeaders(created.token ?? '')),
      409,
      AGENTS_ERROR_CODES.AGENT_PAUSED,
    )
    const resumed = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id, `/${id}/resume`)),
      200,
      agentChannelDtoSchema,
    )
    expect(resumed.status).toBe('active')
    // resuming an active channel changes nothing
    const unchanged = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id, `/${id}/resume`)),
      200,
      agentChannelDtoSchema,
    )
    expect(unchanged.updatedAt).toBe(resumed.updatedAt)
  })

  it('rotate and remove: the previous token stops working at once', async () => {
    const setup = await setupAgents()
    const { agent, channel, token } = await publishedWithWidget(setup)

    const rotated = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id, `/${channel.id}/rotate-token`)),
      200,
      agentChannelCreatedDtoSchema,
    )
    expect(rotated.token).toMatch(WIDGET_TOKEN_PATTERN)
    expect(rotated.token).not.toBe(token)
    expectError(
      await widget(setup, 'GET', '/config', widgetHeaders(token)),
      401,
      AGENTS_ERROR_CODES.AGENT_WIDGET_TOKEN_INVALID,
    )
    const next = rotated.token ?? ''
    expectData(
      await widget(setup, 'GET', '/config', widgetHeaders(next)),
      200,
      widgetConfigDtoSchema,
    )

    const removed = await setup.call('adam', 'DELETE', channelsUrl(agent.id, `/${channel.id}`))
    expect(removed.statusCode).toBe(204)
    expectError(
      await widget(setup, 'GET', '/config', widgetHeaders(next)),
      401,
      AGENTS_ERROR_CODES.AGENT_WIDGET_TOKEN_INVALID,
    )
    expectError(
      await setup.call('adam', 'POST', channelsUrl(agent.id, `/${channel.id}/rotate-token`)),
      404,
      AGENTS_ERROR_CODES.AGENT_CHANNEL_NOT_FOUND,
    )

    const actions = await setup.db.system('test', (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.targetId, channel.id))),
    )
    expect(actions.map((row) => row.action).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'agent_channel.disconnected',
      'agent_channel.token_rotated',
    ])
  })

  it('are changed only by Admins and Owners, and never SurefyOS chat', async () => {
    const setup = await setupAgents()
    const { agent, channel } = await publishedWithWidget(setup)
    expectError(
      await setup.call('bella', 'POST', channelsUrl(agent.id, `/${channel.id}/pause`)),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await setup.call('bella', 'POST', channelsUrl(agent.id), { type: 'api' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    const list = expectData(
      await setup.call('adam', 'GET', channelsUrl(agent.id)),
      200,
      agentChannelListDtoSchema,
    )
    const chat = list.items.find((item) => item.type === 'workspace_chat')
    expectError(
      await setup.call('adam', 'POST', channelsUrl(agent.id, `/${chat?.id ?? ''}/pause`)),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    // a draft agent has nothing live to put on a channel
    const draft = await setup.create('bella')
    expectError(
      await setup.call('adam', 'POST', channelsUrl(draft.id), { type: 'api' }),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_PUBLISHED,
    )
  })
})

describe('the public widget endpoint', () => {
  it('shows the agent, its greeting, starters and look', async () => {
    const setup = await setupAgents()
    const { token } = await publishedWithWidget(setup)
    const config = expectData(
      await widget(setup, 'GET', '/config', widgetHeaders(token)),
      200,
      widgetConfigDtoSchema,
    )
    expect(config).toEqual({
      agentName: 'Order help',
      greeting: 'Hi! Ask me about orders.',
      conversationStarters: ['Where is my order?'],
      theme: 'light',
      position: 'bottom_left',
      locale: 'en',
      messageMaxLength: 4000,
    })
  })

  it('needs a valid token and one of the allowed origins', async () => {
    const setup = await setupAgents()
    const { token } = await publishedWithWidget(setup)
    expectError(
      await widget(setup, 'GET', '/config', { origin: SHOP }),
      401,
      AGENTS_ERROR_CODES.AGENT_WIDGET_TOKEN_INVALID,
    )
    expectError(
      await widget(setup, 'GET', '/config', widgetHeaders(`wt_${'x'.repeat(43)}`)),
      401,
      AGENTS_ERROR_CODES.AGENT_WIDGET_TOKEN_INVALID,
    )
    expectError(
      await widget(setup, 'GET', '/config', widgetHeaders(token, 'https://evil.example.com')),
      403,
      AGENTS_ERROR_CODES.AGENT_WIDGET_ORIGIN_NOT_ALLOWED,
    )
    expectError(
      await widget(setup, 'GET', '/config', widgetHeaders(token, null)),
      403,
      AGENTS_ERROR_CODES.AGENT_WIDGET_ORIGIN_NOT_ALLOWED,
    )
  })

  it('answers nothing for a paused agent', async () => {
    const setup = await setupAgents()
    const { agent, token } = await publishedWithWidget(setup)
    await setup.call('bella', 'POST', `/${agent.id}/pause`)
    expectError(
      await widget(setup, 'POST', '/messages', widgetHeaders(token), message()),
      409,
      AGENTS_ERROR_CODES.AGENT_PAUSED,
    )
  })

  it('starts an anonymous widget run and streams its events', async () => {
    const setup = await setupAgents()
    const { agent, channel, token } = await publishedWithWidget(setup)

    const { response, run } = await sendAndEnd(setup, agent.id, token)
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    const events = eventsOf(response.body)
    expect(events[0]).toEqual({ event: 'run', data: { runId: run.id } })
    expect(events.at(-1)).toEqual({ event: 'done', data: { status: 'canceled', errorCode: null } })
    expect(response.body).not.toContain('data-step')
    expect(run).toMatchObject({
      trigger: 'widget',
      channelId: channel.id,
      startedByUserId: null,
      apiKeyId: null,
      teamId: null,
      isTest: false,
    })

    const [row] = await setup.db.system('test', (tx) =>
      tx.select().from(agentChannels).where(eq(agentChannels.id, channel.id)),
    )
    expect(row?.lastActiveAt).not.toBeNull()

    // reattaching needs the conversation that started the run
    const reattach = (conversation: string) =>
      widget(setup, 'GET', `/runs/${run.id}/events`, {
        ...widgetHeaders(token),
        [WIDGET_CONVERSATION_HEADER]: conversation,
      })
    expectError(
      await reattach('0198f2c0-0000-4000-8000-0000000000c2'),
      404,
      AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_FOUND,
    )
    const again = await reattach(CONVERSATION)
    expect(again.statusCode).toBe(200)
    expect(eventsOf(again.body).at(-1)?.event).toBe('done')
  })

  it('does not show the runs of other channels', async () => {
    const setup = await setupAgents()
    const first = await publishedWithWidget(setup)
    const second = await publishedWithWidget(setup)
    const { run } = await sendAndEnd(setup, first.agent.id, first.token)
    expectError(
      await widget(setup, 'GET', `/runs/${run.id}/events`, {
        ...widgetHeaders(second.token),
        [WIDGET_CONVERSATION_HEADER]: CONVERSATION,
      }),
      404,
      AGENT_RUNS_ERROR_CODES.AGENT_RUN_NOT_FOUND,
    )
  })

  it('limits the messages a minute, and says when to try again', async () => {
    const setup = await setupAgents()
    const { channel, token } = await publishedWithWidget(setup)
    const minute = Math.floor(Date.now() / 60_000)
    await setup.container.cache.client.set(
      orgKey(setup.a.id, 'agent-channel', channel.id, 'rate', minute),
      '60',
      'EX',
      120,
    )
    const response = await widget(setup, 'POST', '/messages', widgetHeaders(token), message())
    expectError(response, 429, ERROR_CODES.RATE_LIMITED)
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('answers CORS for any site on the public host, without cookies', async () => {
    const setup = await setupAgents()
    const preflight = await setup.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/widget/messages',
      headers: {
        host: TEST_API_HOST,
        origin: SHOP,
        'access-control-request-method': 'POST',
        'access-control-request-headers': `content-type,${WIDGET_TOKEN_HEADER}`,
      },
    })
    expect(preflight.headers['access-control-allow-origin']).toBe(SHOP)
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined()
    expect(String(preflight.headers['access-control-allow-headers'])).toContain(WIDGET_TOKEN_HEADER)

    // the rest of the API keeps its allow-list
    const other = await setup.app.inject({
      method: 'OPTIONS',
      url: `/api/v1/orgs/${setup.a.id}/agents`,
      headers: { host: TEST_API_HOST, origin: SHOP, 'access-control-request-method': 'GET' },
    })
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('the widget script', () => {
  it('is served to any site with an ETag', async () => {
    const setup = await setupAgents({
      widgetScript: () => Promise.resolve({ body: '(()=>{})()', etag: '"abc"' }),
    })
    const response = await request(setup.app, 'GET', WIDGET_SCRIPT_PATH)
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/javascript')
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(response.headers.etag).toBe('"abc"')
    expect(response.body).toBe('(()=>{})()')

    const cached = await request(setup.app, 'GET', WIDGET_SCRIPT_PATH, {
      headers: { 'if-none-match': '"abc"' },
    })
    expect(cached.statusCode).toBe(304)
  })

  it('is not found when the widget was not built', async () => {
    const setup = await setupAgents({ widgetScript: () => Promise.resolve(null) })
    expectError(await request(setup.app, 'GET', WIDGET_SCRIPT_PATH), 404, ERROR_CODES.NOT_FOUND)
  })
})
