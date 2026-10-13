// SPDX-License-Identifier: AGPL-3.0-only
import { createHmac } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { agentChannels, agentRuns, approvals } from '@/database/tables/index.js'
import {
  agentChannelCreatedDtoSchema,
  agentChannelDtoSchema,
  agentChannelListDtoSchema,
  AGENTS_ERROR_CODES,
  CONNECTIONS_ERROR_CODES,
  ERROR_CODES,
  oauthCompleteDtoSchema,
  oauthStartDtoSchema,
  SLACK_EVENTS_PATH,
  SLACK_SIGNATURE_HEADER,
  SLACK_TIMESTAMP_HEADER,
  WHATSAPP_SIGNATURE_HEADER,
  WHATSAPP_WEBHOOK_PATH,
  WIDGET_TOKEN_PATTERN,
} from '@surefy/contracts'

import { request, expectData, expectError } from '../../../../test/helpers/request.js'
import { setupAgents, type AgentsSetup } from '../../agents/__tests__/agentsTestKit.js'
import { stubWhatsApp } from '../../connections/__tests__/connectionsTestKit.js'
import { FAILED_REPLY } from '../agentPublishing.replies.js'

const SIGNING_SECRET = 'slack-signing-secret-for-tests'
const APP_SECRET = 'meta-app-secret'
const PHONE_NUMBER_ID = '105500112233'

const ENV = {
  CONNECTIONS_OAUTH_SLACK_CLIENT_ID: 'slack-client-id',
  CONNECTIONS_OAUTH_SLACK_CLIENT_SECRET: 'slack-client-secret',
  CONNECTIONS_SLACK_SIGNING_SECRET: SIGNING_SECRET,
}

const org = (setup: AgentsSetup, path: string) => `/api/v1/orgs/${setup.a.id}${path}`
const adam = (setup: AgentsSetup) => setup.sessionOf(setup.a.members.adam)
const channelsUrl = (agentId: string, path = '') => `/${agentId}/channels${path}`

/** A published agent of Bella's. */
async function published(setup: AgentsSetup, name = 'Order help') {
  const agent = await setup.create('bella', { name })
  await setup.publish('bella', agent.id, { baseRevision: agent.draft.revision, channels: [] })
  return agent
}

/** An organization Slack connection of workspace T1 with bot U0BOT, through the OAuth flow. */
async function slackConnection(setup: AgentsSetup): Promise<string> {
  setup.http.on('slack.com/api/oauth.v2.access', {
    body: {
      ok: true,
      access_token: 'slack-bot-token-for-tests',
      token_type: 'bot',
      scope: 'chat:write',
    },
  })
  setup.http.on('slack.com/api/auth.test', {
    body: { ok: true, team: 'Acme Slack', team_id: 'T1', user_id: 'U0BOT' },
  })
  const { state } = expectData(
    await request(setup.app, 'POST', org(setup, '/connections/oauth/start'), {
      headers: adam(setup),
      payload: { providerKey: 'slack', scope: 'organization' },
    }),
    200,
    oauthStartDtoSchema,
  )
  const done = expectData(
    await request(setup.app, 'POST', org(setup, '/connections/oauth/complete'), {
      headers: adam(setup),
      payload: { state, code: 'slack-code' },
    }),
    200,
    oauthCompleteDtoSchema,
  )
  return done.connection.id
}

/** An organization WhatsApp connection of the business number, with its app secret. */
async function whatsappConnection(setup: AgentsSetup): Promise<string> {
  stubWhatsApp(setup.http, { phoneNumberId: PHONE_NUMBER_ID })
  const response = await request(setup.app, 'POST', org(setup, '/connections'), {
    headers: adam(setup),
    payload: {
      providerKey: 'whatsapp',
      authType: 'bearer',
      secret: 'whatsapp-access-token',
      extra: { phoneNumberId: PHONE_NUMBER_ID, appSecret: APP_SECRET },
      scope: 'organization',
    },
  })
  if (response.statusCode !== 201) throw new Error(`whatsapp connection: ${response.body}`)
  return response.json<{ data: { id: string } }>().data.id
}

const slackConfig = { channelIds: [], respondTo: 'mentions' as const }

/** A Slack Events API delivery, signed now unless told otherwise. */
const slackEvent = (
  setup: AgentsSetup,
  payload: unknown,
  options: { secret?: string; at?: number } = {},
) => {
  const body = JSON.stringify(payload)
  const timestamp = String(options.at ?? Math.floor(Date.now() / 1000))
  const signature =
    'v0=' +
    createHmac('sha256', options.secret ?? SIGNING_SECRET)
      .update(`v0:${timestamp}:${body}`)
      .digest('hex')
  return setup.app.inject({
    method: 'POST',
    url: SLACK_EVENTS_PATH,
    headers: {
      'content-type': 'application/json',
      [SLACK_SIGNATURE_HEADER]: signature,
      [SLACK_TIMESTAMP_HEADER]: timestamp,
    },
    payload: body,
  })
}

const mention = (eventId: string, text = '<@U0BOT> where is order 1182?', extra = {}) => ({
  type: 'event_callback',
  team_id: 'T1',
  event_id: eventId,
  authorizations: [{ user_id: 'U0BOT' }],
  event: {
    type: 'app_mention',
    user: 'U9PERSON',
    text,
    channel: 'C42',
    ts: '1700000000.000100',
    ...extra,
  },
})

const whatsappEvent = (setup: AgentsSetup, payload: unknown, secret = APP_SECRET) => {
  const body = JSON.stringify(payload)
  return setup.app.inject({
    method: 'POST',
    url: WHATSAPP_WEBHOOK_PATH,
    headers: {
      'content-type': 'application/json',
      [WHATSAPP_SIGNATURE_HEADER]:
        'sha256=' + createHmac('sha256', secret).update(body).digest('hex'),
    },
    payload: body,
  })
}

const whatsappMessage = (id: string, text = 'Hi, where is my order?') => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: PHONE_NUMBER_ID },
            messages: [{ id, from: '4915112345678', type: 'text', text: { body: text } }],
          },
        },
      ],
    },
  ],
})

const runsOf = (setup: AgentsSetup, agentId: string) =>
  setup.db.system('test', (tx) => tx.select().from(agentRuns).where(eq(agentRuns.agentId, agentId)))

const channelRow = async (setup: AgentsSetup, id: string) => {
  const [row] = await setup.db.system('test', (tx) =>
    tx.select().from(agentChannels).where(eq(agentChannels.id, id)),
  )
  return row
}

describe('channel requests', () => {
  it('turn a Builder’s widget on when an Admin approves, and let the Builder issue its token once', async () => {
    const setup = await setupAgents()
    const agent = await published(setup)
    const requested = expectData(
      await setup.call('bella', 'POST', channelsUrl(agent.id), {
        type: 'widget',
        config: {
          allowedOrigins: ['https://shop.example.com'],
          greeting: '',
          theme: 'auto',
          position: 'bottom_right',
        },
      }),
      201,
      agentChannelCreatedDtoSchema,
    )
    expect(requested).toMatchObject({ token: null, channel: { status: 'pending_approval' } })
    const approvalId = requested.channel.approvalId ?? ''
    const [approval] = await setup.db.system('test', (tx) =>
      tx.select().from(approvals).where(eq(approvals.id, approvalId)),
    )
    expect(approval).toMatchObject({
      kind: 'channel_publish',
      status: 'pending',
      payload: { kind: 'channel_publish', channelId: requested.channel.id, channelType: 'widget' },
    })

    // a Builder cannot change a channel that waits, nor approve it
    expectError(
      await setup.call(
        'bella',
        'POST',
        channelsUrl(agent.id, `/${requested.channel.id}/rotate-token`),
      ),
      409,
      AGENTS_ERROR_CODES.AGENT_CHANNEL_PENDING_APPROVAL,
    )
    const approved = await request(
      setup.app,
      'POST',
      org(setup, `/approvals/${approvalId}/approve`),
      {
        headers: adam(setup),
        payload: {},
      },
    )
    expect(approved.statusCode).toBe(200)

    const list = expectData(
      await setup.call('bella', 'GET', channelsUrl(agent.id)),
      200,
      agentChannelListDtoSchema,
    )
    const widget = list.items.find((item) => item.type === 'widget')
    expect(widget).toMatchObject({ status: 'active', publicTokenPrefix: null, approvalId: null })
    expect(widget?.approvedBy?.id).toBe(setup.a.members.adam.id)

    const issued = expectData(
      await setup.call(
        'bella',
        'POST',
        channelsUrl(agent.id, `/${requested.channel.id}/rotate-token`),
      ),
      200,
      agentChannelCreatedDtoSchema,
    )
    expect(issued.token).toMatch(WIDGET_TOKEN_PATTERN)
    expectError(
      await setup.call(
        'bella',
        'POST',
        channelsUrl(agent.id, `/${requested.channel.id}/rotate-token`),
      ),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectData(
      await setup.call(
        'adam',
        'POST',
        channelsUrl(agent.id, `/${requested.channel.id}/rotate-token`),
      ),
      200,
      agentChannelCreatedDtoSchema,
    )
  })

  it('end disconnected when rejected or taken back', async () => {
    const setup = await setupAgents()
    const agent = await published(setup)
    const first = expectData(
      await setup.call('bella', 'POST', channelsUrl(agent.id), { type: 'api' }),
      201,
      agentChannelCreatedDtoSchema,
    )
    const rejected = await request(
      setup.app,
      'POST',
      org(setup, `/approvals/${first.channel.approvalId ?? ''}/reject`),
      { headers: adam(setup), payload: { reason: 'other', note: 'Not for external use' } },
    )
    expect(rejected.statusCode).toBe(200)
    expect((await channelRow(setup, first.channel.id))?.status).toBe('disconnected')

    const second = expectData(
      await setup.call('bella', 'POST', channelsUrl(agent.id), { type: 'api' }),
      201,
      agentChannelCreatedDtoSchema,
    )
    expect(second.channel.status).toBe('pending_approval')
    const removed = await setup.call(
      'bella',
      'DELETE',
      channelsUrl(agent.id, `/${second.channel.id}`),
    )
    expect(removed.statusCode).toBe(204)
    expect((await channelRow(setup, second.channel.id))?.status).toBe('disconnected')
    const [approval] = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(approvals)
        .where(eq(approvals.id, second.channel.approvalId ?? '')),
    )
    expect(approval?.status).toBe('canceled')
  })
})

describe('Slack channels', () => {
  it('route by the workspace and the bot, answer one agent per workspace, and show the events address', async () => {
    const setup = await setupAgents({ env: ENV })
    const connectionId = await slackConnection(setup)
    const agent = await published(setup)
    const created = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id), {
        type: 'slack',
        connectionId,
        config: slackConfig,
      }),
      201,
      agentChannelCreatedDtoSchema,
    )
    expect(created.channel).toMatchObject({
      status: 'active',
      externalAccountId: 't1/u0bot',
      connection: { id: connectionId, status: 'active' },
      webhook: { verifyToken: null },
    })
    expect(created.channel.webhook?.url).toMatch(/\/api\/v1\/channels\/slack\/events$/)

    const other = await published(setup, 'Second agent')
    expectError(
      await setup.call('adam', 'POST', channelsUrl(other.id), {
        type: 'slack',
        connectionId,
        config: slackConfig,
      }),
      409,
      AGENTS_ERROR_CODES.AGENT_CHANNEL_ACCOUNT_IN_USE,
    )
  })

  it('answer the set-up check and refuse unsigned or old events', async () => {
    const setup = await setupAgents({ env: ENV })
    const check = await slackEvent(setup, { type: 'url_verification', challenge: 'abc123' })
    expect(check.statusCode).toBe(200)
    expect(check.body).toBe('abc123')
    expectError(
      await slackEvent(setup, { type: 'url_verification', challenge: 'x' }, { secret: 'wrong' }),
      401,
      AGENTS_ERROR_CODES.AGENT_CHANNEL_SIGNATURE_INVALID,
    )
    expectError(
      await slackEvent(
        setup,
        { type: 'url_verification', challenge: 'x' },
        { at: Math.floor(Date.now() / 1000) - 600 },
      ),
      401,
      AGENTS_ERROR_CODES.AGENT_CHANNEL_SIGNATURE_INVALID,
    )
  })

  it('start one run per mention, with the thread as the reply address, and post the answer there', async () => {
    const setup = await setupAgents({ env: ENV })
    const connectionId = await slackConnection(setup)
    const agent = await published(setup)
    const created = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id), {
        type: 'slack',
        connectionId,
        config: slackConfig,
      }),
      201,
      agentChannelCreatedDtoSchema,
    )

    expect((await slackEvent(setup, mention('Ev1'))).statusCode).toBe(200)
    // Slack retries the same event: still one run
    expect((await slackEvent(setup, mention('Ev1'))).statusCode).toBe(200)
    // a direct message is not for a channel that answers mentions
    await slackEvent(setup, {
      ...mention('Ev2'),
      event: {
        type: 'message',
        channel_type: 'im',
        user: 'U9PERSON',
        text: 'hi',
        channel: 'D1',
        ts: '1700000001.000100',
      },
    })
    // the agent's own messages never start a run
    await slackEvent(setup, mention('Ev3', 'my own answer', { user: 'U0BOT' }))
    const runs = await runsOf(setup, agent.id)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      trigger: 'slack',
      channelId: created.channel.id,
      startedByUserId: null,
    })

    // the run fails: the thread gets the apology
    const run = runs[0]
    if (run === undefined) throw new Error('no run')
    await setup.db.system('test', (tx) =>
      tx
        .update(agentRuns)
        .set({ status: 'failed', finishedAt: new Date() })
        .where(eq(agentRuns.id, run.id)),
    )
    setup.http.on('slack.com/api/chat.postMessage', { body: { ok: true } })
    await setup.container.modules.agentPublishing.replies.onRunFinished(
      setup.a.id,
      run.id,
      'failed',
    )
    await setup.container.modules.agentPublishing.replies.onRunFinished(
      setup.a.id,
      run.id,
      'failed',
    )
    const posts = setup.http.callsTo('slack.com/api/chat.postMessage')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0]?.request.body ?? '{}')).toMatchObject({
      channel: 'C42',
      thread_ts: '1700000000.000100',
      text: FAILED_REPLY,
    })
    expect(posts[0]?.request.headers?.authorization).toBe('Bearer slack-bot-token-for-tests')
  })

  it('go to error when Slack refuses the connection, and resume once it works again', async () => {
    const setup = await setupAgents({ env: ENV })
    const connectionId = await slackConnection(setup)
    const agent = await published(setup)
    const created = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id), {
        type: 'slack',
        connectionId,
        config: slackConfig,
      }),
      201,
      agentChannelCreatedDtoSchema,
    )
    await slackEvent(setup, mention('Ev10'))
    const [run] = await runsOf(setup, agent.id)
    if (run === undefined) throw new Error('no run')
    await setup.db.system('test', (tx) =>
      tx
        .update(agentRuns)
        .set({ status: 'failed', finishedAt: new Date() })
        .where(eq(agentRuns.id, run.id)),
    )
    setup.http.on('slack.com/api/chat.postMessage', { body: { ok: false, error: 'token_revoked' } })
    await setup.container.modules.agentPublishing.replies.onRunFinished(
      setup.a.id,
      run.id,
      'failed',
    )
    expect(await channelRow(setup, created.channel.id)).toMatchObject({
      status: 'error',
      lastErrorCode: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
    })

    // the channel answers nothing while in error
    await slackEvent(setup, mention('Ev11'))
    expect(await runsOf(setup, agent.id)).toHaveLength(1)

    const resumed = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id, `/${created.channel.id}/resume`)),
      200,
      agentChannelDtoSchema,
    )
    expect(resumed).toMatchObject({ status: 'active', lastErrorCode: null })
  })
})

describe('WhatsApp channels', () => {
  it('answer Meta’s set-up check with the channel’s verify token only', async () => {
    const setup = await setupAgents()
    const connectionId = await whatsappConnection(setup)
    const agent = await published(setup)
    const created = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id), {
        type: 'whatsapp',
        connectionId,
        config: { businessAccountId: '2000', welcomeMessage: '' },
      }),
      201,
      agentChannelCreatedDtoSchema,
    )
    const verifyToken = created.channel.webhook?.verifyToken ?? ''
    expect(verifyToken).toMatch(/^wv_/)
    expect(created.channel.externalAccountId).toBe(PHONE_NUMBER_ID)

    const verify = (token: string) =>
      setup.app.inject({
        method: 'GET',
        url: WHATSAPP_WEBHOOK_PATH,
        query: { 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '8812' },
      })
    const ok = await verify(verifyToken)
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toBe('8812')
    expectError(
      await verify(`${verifyToken.slice(0, -1)}x`),
      403,
      AGENTS_ERROR_CODES.AGENT_CHANNEL_VERIFY_TOKEN_INVALID,
    )
  })

  it('start a run for a signed message, greet a new chat, and refuse a bad signature', async () => {
    const setup = await setupAgents()
    const connectionId = await whatsappConnection(setup)
    const agent = await published(setup)
    const created = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id), {
        type: 'whatsapp',
        connectionId,
        config: { businessAccountId: '2000', welcomeMessage: 'Hi! This is Acme support.' },
      }),
      201,
      agentChannelCreatedDtoSchema,
    )
    setup.http.on(`graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      body: { messages: [{ id: 'out' }] },
    })

    expectError(
      await whatsappEvent(setup, whatsappMessage('wamid.1'), 'wrong-secret'),
      401,
      AGENTS_ERROR_CODES.AGENT_CHANNEL_SIGNATURE_INVALID,
    )
    expect(await runsOf(setup, agent.id)).toHaveLength(0)

    expect((await whatsappEvent(setup, whatsappMessage('wamid.1'))).statusCode).toBe(200)
    expect((await whatsappEvent(setup, whatsappMessage('wamid.1'))).statusCode).toBe(200)
    const runs = await runsOf(setup, agent.id)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ trigger: 'whatsapp', channelId: created.channel.id })
    const sent = setup.http.callsTo(`${PHONE_NUMBER_ID}/messages`)
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0]?.request.body ?? '{}')).toMatchObject({
      to: '4915112345678',
      text: { body: 'Hi! This is Acme support.' },
    })

    // a second message in the same chat gets no second greeting
    await whatsappEvent(setup, whatsappMessage('wamid.2', 'And the refund?'))
    expect(await runsOf(setup, agent.id)).toHaveLength(2)
    expect(setup.http.callsTo(`${PHONE_NUMBER_ID}/messages`)).toHaveLength(1)
  })

  it('go to error when their connection expires', async () => {
    const setup = await setupAgents()
    const connectionId = await whatsappConnection(setup)
    const agent = await published(setup)
    const created = expectData(
      await setup.call('adam', 'POST', channelsUrl(agent.id), {
        type: 'whatsapp',
        connectionId,
        config: { businessAccountId: '2000', welcomeMessage: '' },
      }),
      201,
      agentChannelCreatedDtoSchema,
    )
    await setup.container.modules.agentPublishing.replies.onConnectionExpired(
      setup.a.id,
      connectionId,
    )
    expect(await channelRow(setup, created.channel.id)).toMatchObject({
      status: 'error',
      lastErrorCode: CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
    })
    const [row] = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(agentChannels)
        .where(and(eq(agentChannels.agentId, agent.id), eq(agentChannels.type, 'whatsapp'))),
    )
    expect(row?.connectionId).toBe(connectionId)
  })
})
