// SPDX-License-Identifier: AGPL-3.0-only
import { AppError } from '@/core/errors/index.js'
import { connectionAuthHeaders } from '@/modules/connections/index.js'
import {
  AGENT_RUNS_ERROR_CODES,
  AGENT_TOOL_FAILURE_CODES,
  AGENTS_ERROR_CODES,
  CONNECTIONS_ERROR_CODES,
} from '@surefy/contracts'
import type { AgentToolFailureCode, ConnectionSecret } from '@surefy/contracts'

import type { Attempt, AgentToolsConnections, AgentToolsContext } from './agentTools.types.js'
import type { OutboundError } from '@/modules/connections/index.js'

// What the API and MCP adapters share: failures as data, the outbound client's errors, and the
// opening of the connection a tool names.

export type Failed = Extract<Attempt, { ok: false }>

export function failed(
  code: string,
  message: string,
  target: string,
  options: {
    content?: string
    transient?: boolean
    beforeSend?: boolean
    reason?: AgentToolFailureCode
  } = {},
): Failed {
  return {
    ok: false,
    code,
    message,
    content: options.content ?? message,
    target,
    transient: options.transient ?? false,
    beforeSend: options.beforeSend ?? false,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  }
}

/** The code, when it is one the editor's test call and discovery name. */
export const asFailureReason = (code: string): AgentToolFailureCode | undefined =>
  AGENT_TOOL_FAILURE_CODES.find((candidate) => candidate === code)

/** A failure of the safe outbound client, as the model and the timeline should read it. */
export function outboundFailure(error: OutboundError, target: string): Failed {
  switch (error.kind) {
    case 'unsafe':
      return failed(
        AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
        'This address cannot be called from SurefyOS',
        target,
        { reason: CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED },
      )
    case 'timeout':
      return failed(
        AGENT_RUNS_ERROR_CODES.AGENT_TOOL_TIMEOUT,
        'The server did not answer in time',
        target,
        { transient: true, reason: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_TIMEOUT },
      )
    case 'too_large':
      return failed(
        AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
        'The answer is larger than SurefyOS reads',
        target,
        { reason: AGENTS_ERROR_CODES.AGENT_TOOL_BAD_RESPONSE },
      )
    case 'unreachable':
      return failed(
        AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
        'The server could not be reached',
        target,
        // a refused connection or an unknown host: the request never left
        {
          transient: true,
          beforeSend: /^(connect|getaddrinfo)\b/i.test(error.message),
          reason: CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE,
        },
      )
  }
}

export interface OpenedConnection {
  secret: ConnectionSecret | null
  headers: Record<string, string>
}

const sameOrigin = (a: string, b: string): boolean => {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/**
 * The credentials of the connection a tool names, opened for this call. A connection is only
 * sent to the server it was made for: its provider must be the tool's kind of connection and
 * the tool's address must be on the connection's own origin, so a tool pointed elsewhere never
 * receives the token.
 */
export async function openToolConnection(
  connections: AgentToolsConnections,
  ctx: AgentToolsContext,
  use: { connectionId: string | null; address: string; provider: string; target: string },
): Promise<{ ok: true; connection: OpenedConnection } | { ok: false; failure: Failed }> {
  if (use.connectionId === null) return { ok: true, connection: { secret: null, headers: {} } }
  let opened
  try {
    opened = await connections.open(ctx.orgId, ctx.principal, use.connectionId)
  } catch (error) {
    // an expired, revoked or forbidden connection fails the call with its own code
    if (error instanceof AppError) {
      const reason = asFailureReason(error.code)
      return {
        ok: false,
        failure: failed(
          error.code,
          error.message,
          use.target,
          reason === undefined ? {} : { reason },
        ),
      }
    }
    throw error
  }
  if (
    opened.providerKey !== use.provider ||
    opened.baseUrl === null ||
    !sameOrigin(opened.baseUrl, use.address)
  ) {
    return {
      ok: false,
      failure: failed(
        AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
        'This connection cannot be used with this address',
        use.target,
        { reason: CONNECTIONS_ERROR_CODES.CONNECTION_BASE_URL_NOT_ALLOWED },
      ),
    }
  }
  return {
    ok: true,
    connection: { secret: opened.secret, headers: connectionAuthHeaders(opened.secret) },
  }
}
