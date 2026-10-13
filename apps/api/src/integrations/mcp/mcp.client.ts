// SPDX-License-Identifier: AGPL-3.0-only
import {
  MCP_LIST_PAGES_MAX,
  MCP_PROTOCOL_VERSION,
  MCP_REQUEST_TIMEOUT_MS,
  MCP_SUPPORTED_VERSIONS,
  MCP_TOOLS_MAX,
} from './mcp.constants.js'
import { McpError } from './mcp.errors.js'
import { readCallResult, readToolPage } from './mcp.result.js'
import { readRpcResponse } from './mcp.sse.js'

import type {
  McpCallResult,
  McpHttpResponse,
  McpSend,
  McpServer,
  McpToolInfo,
} from './mcp.types.js'

export interface McpClientOptions {
  send: McpSend
  /** Named to the server in `initialize`. */
  clientName: string
  clientVersion: string
  requestTimeoutMs?: number
}

/** One open session: requests share the headers the handshake settled on. */
interface Session {
  request(method: string, params: Record<string, unknown>): Promise<unknown>
}

const statusError = (response: McpHttpResponse): McpError =>
  response.status === 401 || response.status === 403
    ? new McpError('unauthorized', 'The server refused the credentials', response.status)
    : new McpError('http', `The server answered HTTP ${String(response.status)}`, response.status)

/**
 * An MCP client for servers that speak Streamable HTTP (a JSON-RPC 2.0 request per POST, answered
 * as JSON or as an event stream). Every operation opens its own session and closes it: the
 * worker keeps nothing between calls. Server-initiated requests (sampling, roots) are not served.
 */
export class McpClient {
  private readonly timeoutMs: number

  constructor(private readonly options: McpClientOptions) {
    this.timeoutMs = options.requestTimeoutMs ?? MCP_REQUEST_TIMEOUT_MS
  }

  /** The tools the server offers, at most `MCP_TOOLS_MAX`. */
  listTools(server: McpServer): Promise<McpToolInfo[]> {
    return this.withSession(server, async (session) => {
      const tools: McpToolInfo[] = []
      let cursor: string | null = null
      for (let page = 0; page < MCP_LIST_PAGES_MAX; page += 1) {
        const result = await session.request('tools/list', cursor === null ? {} : { cursor })
        const read = readToolPage(result)
        tools.push(...read.tools)
        cursor = read.nextCursor
        if (cursor === null || tools.length >= MCP_TOOLS_MAX) break
      }
      return tools.slice(0, MCP_TOOLS_MAX)
    })
  }

  callTool(server: McpServer, name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    return this.withSession(server, async (session) =>
      readCallResult(await session.request('tools/call', { name, arguments: args })),
    )
  }

  private async withSession<T>(
    server: McpServer,
    run: (session: Session) => Promise<T>,
  ): Promise<T> {
    const post = (headers: Record<string, string>, body: unknown) =>
      this.options.send(server.url, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          ...server.headers,
          ...headers,
        },
        body: JSON.stringify(body),
        timeoutMs: this.timeoutMs,
      })

    let nextId = 0
    const open = async (): Promise<{ session: Session; headers: Record<string, string> }> => {
      const initialize = await this.request(post, {}, ++nextId, 'initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: this.options.clientName, version: this.options.clientVersion },
      })
      const version = (initialize.result as { protocolVersion?: unknown } | null)?.protocolVersion
      if (typeof version !== 'string' || !MCP_SUPPORTED_VERSIONS.includes(version)) {
        throw new McpError('unsupported', 'The server speaks a protocol version SurefyOS does not')
      }
      const sessionId = initialize.response.headers['mcp-session-id']
      const headers: Record<string, string> = {
        'mcp-protocol-version': version,
        ...(sessionId === undefined ? {} : { 'mcp-session-id': sessionId }),
      }
      const notified = await post(headers, { jsonrpc: '2.0', method: 'notifications/initialized' })
      if (notified.status >= 400) throw statusError(notified)
      return {
        headers,
        session: {
          request: async (method, params) =>
            (await this.request(post, headers, ++nextId, method, params)).result,
        },
      }
    }

    const { session, headers } = await open()
    try {
      return await run(session)
    } finally {
      if (headers['mcp-session-id'] !== undefined) {
        // best effort: a server that keeps the session or refuses the close is not our failure
        await this.options
          .send(server.url, {
            method: 'DELETE',
            headers: { ...server.headers, ...headers },
            timeoutMs: this.timeoutMs,
          })
          .catch(() => {
            /* the session ends on its own */
          })
      }
    }
  }

  private async request(
    post: (headers: Record<string, string>, body: unknown) => Promise<McpHttpResponse>,
    headers: Record<string, string>,
    id: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<{ result: unknown; response: McpHttpResponse }> {
    const response = await post(headers, { jsonrpc: '2.0', id, method, params })
    if (response.status >= 400) throw statusError(response)
    const message = readRpcResponse(response.headers['content-type'] ?? '', response.text, id)
    if (message.error !== undefined) {
      const { code, message: text } = message.error
      throw new McpError(
        'rpc',
        typeof text === 'string' ? text : 'The server reported an error',
        response.status,
        typeof code === 'number' ? code : null,
      )
    }
    return { result: message.result, response }
  }
}
