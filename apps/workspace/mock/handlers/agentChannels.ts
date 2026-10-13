// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import {
  agentChannelCreatedDtoSchema,
  agentChannelDtoSchema,
  ERROR_CODES,
  okResponse,
  SLACK_EVENTS_PATH,
  updateAgentChannelInputSchema,
  WHATSAPP_VERIFY_TOKEN_PREFIX,
  WHATSAPP_WEBHOOK_PATH,
  WIDGET_TOKEN_DISPLAY_PREFIX_LENGTH,
  WIDGET_TOKEN_PREFIX,
} from '@surefy/contracts'
import type {
  AgentChannelDto,
  AgentChannelRequest,
  AgentDetailDto,
  WidgetChannelConfig,
} from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'
import { defineMockHandler, mockError, mockOk } from '@surefy/web-core/testing/mock'

import { findMockConnection, SLACK_ID, WHATSAPP_ID } from './connections'
import { MAYA } from './shell.fixtures'
import { ANA } from './teams'

import type { AgentMockStore } from './agentPublishing'

const CHANNEL_KIND = 73
const APPROVAL_KIND = 74
const HTTP_NOT_FOUND = 404
const HTTP_CONFLICT = 409
const HTTP_UNPROCESSABLE = 422
const CREATED_AT = '2026-01-15T10:00:00.000Z'
const WIDGET_TOKEN_LENGTH = 43
/** Where the mock says Slack and WhatsApp deliver events. */
const MOCK_API_ORIGIN = 'https://api.example.com'

let sequence = 0
let tokens = 0

/** Back to the first ids and tokens; the agents mock's reset calls it. */
export function resetAgentChannelsMock(): void {
  sequence = 0
  tokens = 0
}

/** A widget token in the real shape, different on every call. */
function widgetToken(): string {
  tokens += 1
  const body = `${String(tokens).padStart(4, '0')}MockWidgetToken`
  return `${WIDGET_TOKEN_PREFIX}${body.padEnd(WIDGET_TOKEN_LENGTH, 'x')}`
}

const tokenPrefix = (token: string) => token.slice(0, WIDGET_TOKEN_DISPLAY_PREFIX_LENGTH)

function connectionOf(connectionId: string): AgentChannelDto['connection'] {
  const found = findMockConnection(connectionId)
  return found ? { id: found.id, name: found.name, status: found.status } : null
}

function webhookOf(type: AgentChannelDto['type'], id: string): AgentChannelDto['webhook'] {
  if (type === 'slack') return { url: `${MOCK_API_ORIGIN}${SLACK_EVENTS_PATH}`, verifyToken: null }
  if (type === 'whatsapp') {
    return {
      url: `${MOCK_API_ORIGIN}${WHATSAPP_WEBHOOK_PATH}`,
      verifyToken: `${WHATSAPP_VERIFY_TOKEN_PREFIX}${id.replaceAll('-', '')}MockVerifyToken0000000`,
    }
  }
  return null
}

/**
 * A channel as the API answers it. A widget that goes live carries its token, which the caller
 * shows once; one approved after a Builder's request has none until it is issued.
 */
export function agentChannelFixture(
  agent: Pick<AgentDetailDto, 'id'>,
  request: AgentChannelRequest | { type: 'workspace_chat' },
  status: AgentChannelDto['status'],
  overrides: Partial<AgentChannelDto> = {},
): { channel: AgentChannelDto; token: string | null } {
  sequence += 1
  const id = fixtureUuid(CHANNEL_KIND, sequence)
  const isLiveWidget = request.type === 'widget' && status === 'active'
  const token = isLiveWidget ? widgetToken() : null
  const connectionId = 'connectionId' in request ? request.connectionId : null
  const isExternal = request.type !== 'workspace_chat'
  const channel: AgentChannelDto = {
    id,
    agentId: agent.id,
    type: request.type,
    status,
    config: {
      version: 1,
      ...(request.type === 'api' ? { api: request.config ?? { rateLimitPerMinute: 60 } } : {}),
      ...(request.type === 'widget' ? { widget: request.config } : {}),
      ...(request.type === 'slack' ? { slack: request.config } : {}),
      ...(request.type === 'whatsapp' ? { whatsapp: request.config } : {}),
      exposure: { knowledgeBases: [], tools: [] },
    },
    publicTokenPrefix: token === null ? null : tokenPrefix(token),
    externalAccountId: connectionId === null ? null : `mock-account-${String(sequence)}`,
    connection: connectionId === null ? null : connectionOf(connectionId),
    approvalId: status === 'pending_approval' ? fixtureUuid(APPROVAL_KIND, sequence) : null,
    requestedBy: isExternal ? MAYA : null,
    approvedBy: isExternal && status === 'active' ? ANA : null,
    lastErrorCode: null,
    webhook: webhookOf(request.type, id),
    lastActiveAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  }
  return { channel, token }
}

/** The agent detail's channel scenarios: states that only an approval or a provider brings. */
export type ChannelScenario = 'channels-live' | 'channel-error' | 'widget-approved'

const SCENARIO_WIDGET: WidgetChannelConfig = {
  allowedOrigins: ['https://www.example.com'],
  greeting: '',
  theme: 'auto',
  position: 'bottom_right',
}

/**
 * The external channels a live agent has under a scenario: `channels-live` a widget, Slack and
 * WhatsApp answering; `channel-error` Slack stopped by its expired connection; `widget-approved` a
 * widget approved after a Builder's request, its code not issued yet.
 */
export function scenarioChannels(
  agent: Pick<AgentDetailDto, 'id'>,
  scenario: ChannelScenario,
): AgentChannelDto[] {
  const widget: AgentChannelRequest = { type: 'widget', config: SCENARIO_WIDGET }
  const slack = {
    type: 'slack',
    connectionId: SLACK_ID,
    config: { respondTo: 'mentions', channelIds: [] },
  } as const satisfies AgentChannelRequest
  if (scenario === 'widget-approved') {
    return [agentChannelFixture(agent, widget, 'active', { publicTokenPrefix: null }).channel]
  }
  if (scenario === 'channel-error') {
    return [
      agentChannelFixture(agent, slack, 'error', {
        lastErrorCode: ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
      }).channel,
    ]
  }
  return [
    agentChannelFixture(agent, widget, 'active').channel,
    agentChannelFixture(agent, slack, 'active').channel,
    agentChannelFixture(
      agent,
      {
        type: 'whatsapp',
        connectionId: WHATSAPP_ID,
        config: { businessAccountId: '1029384756', welcomeMessage: '' },
      },
      'active',
      { externalAccountId: '5550001111' },
    ).channel,
  ]
}

const path = '/orgs/:orgId/agents/:agentId/channels/:channelId'
const agentNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_NOT_FOUND, 'Agent not found')
const channelNotFound = () =>
  mockError(HTTP_NOT_FOUND, ERROR_CODES.AGENT_CHANNEL_NOT_FOUND, 'Channel not found')
const pendingApproval = () =>
  mockError(
    HTTP_CONFLICT,
    ERROR_CODES.AGENT_CHANNEL_PENDING_APPROVAL,
    'The channel waits for an admin',
  )

interface Found {
  agent: AgentDetailDto
  channel: AgentChannelDto
}

/** The agent and one of its channels other than SurefyOS chat, or the error to answer. */
function findChannel(store: AgentMockStore, params: Record<string, unknown>): Found | Response {
  const agent = store.find(params.agentId)
  if (!agent) return agentNotFound()
  const channel = agent.channels.find(({ id }) => id === params.channelId)
  if (!channel || channel.type === 'workspace_chat' || channel.status === 'disconnected') {
    return channelNotFound()
  }
  return { agent, channel }
}

function save(store: AgentMockStore, { agent, channel }: Found, changes: Partial<AgentChannelDto>) {
  const updated = { ...channel, ...changes, updatedAt: CREATED_AT }
  store.save({
    ...agent,
    channels: agent.channels.map((entry) => (entry.id === channel.id ? updated : entry)),
  })
  return updated
}

/**
 * The live channels of an agent (Agents › Editor › Publish): settings, pause and resume, a new
 * widget token, turning off. A channel waiting for an admin only allows taking the request back.
 * Scenarios: `error` refuses a change as the provider would; on resume, a Slack or WhatsApp channel
 * whose connection still fails stays in error.
 */
export function agentChannelHandlers(store: AgentMockStore) {
  return [
    defineMockHandler({
      method: 'patch',
      path,
      response: okResponse(agentChannelDtoSchema),
      scenarios: {
        default: async ({ params, request }) => {
          const found = findChannel(store, params)
          if (found instanceof Response) return found
          if (found.channel.status === 'pending_approval') return pendingApproval()
          const input = updateAgentChannelInputSchema.parse(await request.json())
          const { type } = found.channel
          if (type !== 'workspace_chat' && input[type] === undefined && !input.connectionId) {
            return mockError(HTTP_UNPROCESSABLE, ERROR_CODES.VALIDATION_FAILED, 'Nothing to change')
          }
          const config =
            type === 'workspace_chat' || input[type] === undefined
              ? found.channel.config
              : { ...found.channel.config, [type]: input[type] }
          return mockOk(
            save(store, found, {
              config,
              ...(input.connectionId ? { connection: connectionOf(input.connectionId) } : {}),
            }),
          )
        },
        error: () =>
          mockError(
            HTTP_CONFLICT,
            ERROR_CODES.AGENT_CHANNEL_ACCOUNT_IN_USE,
            'The account answers for another agent',
          ),
      },
    }),
    ...(['pause', 'resume'] as const).map((action) =>
      defineMockHandler({
        method: 'post',
        path: `${path}/${action}`,
        response: okResponse(agentChannelDtoSchema),
        scenarios: {
          default: ({ params }) => {
            const found = findChannel(store, params)
            if (found instanceof Response) return found
            if (found.channel.status === 'pending_approval') return pendingApproval()
            if (action === 'pause') return mockOk(save(store, found, { status: 'paused' }))
            const connection = found.channel.connection
            if (connection) {
              const current = connectionOf(connection.id)
              if (current?.status !== 'active') {
                return mockError(
                  HTTP_UNPROCESSABLE,
                  ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
                  'The connection still fails',
                )
              }
              return mockOk(
                save(store, found, { status: 'active', lastErrorCode: null, connection: current }),
              )
            }
            return mockOk(save(store, found, { status: 'active', lastErrorCode: null }))
          },
        },
      }),
    ),
    defineMockHandler({
      method: 'post',
      path: `${path}/rotate-token`,
      response: okResponse(agentChannelCreatedDtoSchema),
      scenarios: {
        default: ({ params }) => {
          const found = findChannel(store, params)
          if (found instanceof Response) return found
          if (found.channel.status === 'pending_approval') return pendingApproval()
          if (found.channel.type !== 'widget') {
            return mockError(HTTP_UNPROCESSABLE, ERROR_CODES.VALIDATION_FAILED, 'Not a widget')
          }
          const token = widgetToken()
          const channel = save(store, found, { publicTokenPrefix: tokenPrefix(token) })
          return mockOk({ channel, token })
        },
      },
    }),
    defineMockHandler({
      method: 'delete',
      path,
      response: okResponse(z.null()),
      scenarios: {
        default: ({ params }) => {
          const found = findChannel(store, params)
          if (found instanceof Response) return found
          save(store, found, {
            status: 'disconnected',
            publicTokenPrefix: null,
            approvalId: null,
            lastErrorCode: null,
          })
          return new Response(null, { status: 204 })
        },
      },
    }),
  ]
}
