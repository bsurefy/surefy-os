// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { NotFoundError } from '@/core/errors/index.js'
import { OutboundError } from '@/modules/connections/index.js'
import type { AgentTool, ConnectionSecret } from '@surefy/contracts'
import { CONNECTIONS_ERROR_CODES } from '@surefy/contracts'

import { createAgentToolsModule } from '../agentTools.module.js'

import type { AgentToolsContext } from '../agentTools.types.js'
import type { ConnectionUse, HttpResult, OutboundHttp } from '@/modules/connections/index.js'

type ApiTool = Extract<AgentTool, { kind: 'api' }>
type McpTool = Extract<AgentTool, { kind: 'mcp' }>

export const CTX: AgentToolsContext = {
  orgId: 'org-1',
  principal: { userId: 'user-1', teamIds: [] },
}

export const TOKEN = 's3cr3t-t0ken'

export const apiTool = (overrides: Partial<ApiTool> = {}): ApiTool => ({
  id: randomUUID(),
  kind: 'api',
  name: 'Orders API',
  description: 'Looks up orders',
  permission: 'read_only',
  enabled: true,
  method: 'GET',
  url: 'https://api.acme.test/orders/{orderId}',
  headers: [],
  inputSchema: null,
  connectionId: null,
  ...overrides,
})

export const mcpTool = (overrides: Partial<McpTool> = {}): McpTool => ({
  id: randomUUID(),
  kind: 'mcp',
  name: 'Support',
  description: 'The support desk',
  permission: 'read_only',
  enabled: true,
  serverUrl: 'https://mcp.acme.test/mcp',
  connectionId: null,
  discoveredActions: [
    { name: 'lookup_ticket', description: '', enabled: true, permission: null },
    { name: 'close_ticket', description: 'Closes it', enabled: true, permission: 'can_act' },
    { name: 'hidden', description: '', enabled: false, permission: null },
  ],
  ...overrides,
})

export const connectionUse = (overrides: Partial<ConnectionUse> = {}): ConnectionUse => ({
  id: randomUUID(),
  providerKey: 'http',
  authType: 'bearer',
  baseUrl: 'https://api.acme.test',
  externalAccountId: null,
  secret: { version: 1, token: TOKEN } satisfies ConnectionSecret,
  ...overrides,
})

export interface SentRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
}

export type Responder = (request: SentRequest, call: number) => HttpResult | Promise<HttpResult>

export const reply = (
  status: number,
  text: string,
  headers: Record<string, string> = { 'content-type': 'application/json' },
): HttpResult => ({ status, headers, text, latencyMs: 1 })

/** A fake outbound client: records every request and answers with `respond`. */
export function fakeHttp(respond: Responder) {
  const sent: SentRequest[] = []
  const http: OutboundHttp = {
    provider: () => Promise.reject(new Error('tools use external')),
    external: async (url, request) => {
      const entry: SentRequest = {
        url,
        method: request.method,
        headers: request.headers ?? {},
        body: request.body,
      }
      sent.push(entry)
      return respond(entry, sent.length)
    },
  }
  return { http, sent }
}

export const outboundFailure = (kind: OutboundError['kind'], message: string = kind) =>
  Promise.reject(new OutboundError(kind, message))

/** Connections the tools may open: by id, or a missing one. */
export function fakeConnections(known: Record<string, ConnectionUse | Error> = {}) {
  const opened: string[] = []
  return {
    opened,
    connections: {
      open: (_orgId: string, _principal: unknown, id: string) => {
        opened.push(id)
        const found = known[id]
        if (found === undefined) {
          return Promise.reject(
            new NotFoundError(CONNECTIONS_ERROR_CODES.CONNECTION_NOT_FOUND, 'Connection not found'),
          )
        }
        return found instanceof Error ? Promise.reject(found) : Promise.resolve(found)
      },
    },
  }
}

/** The module with no waiting between retries; `timeoutMs` shortens the deadline of a call. */
export function buildTools(
  http: OutboundHttp,
  connections: ReturnType<typeof fakeConnections>['connections'],
  timeoutMs?: number,
) {
  const slept: number[] = []
  const { service } = createAgentToolsModule({
    connections,
    http,
    timing: {
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      sleep: (ms) => {
        slept.push(ms)
        return Promise.resolve()
      },
    },
  })
  return { service, slept }
}
