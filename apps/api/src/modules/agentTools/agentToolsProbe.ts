// SPDX-License-Identifier: AGPL-3.0-only
import { UnprocessableError } from '@/core/errors/index.js'
import { OutboundError, type OutboundHttp } from '@/modules/connections/index.js'
import {
  AGENT_RUNS_ERROR_CODES,
  AGENT_TOOL_TEST_PREVIEW_MAX_LENGTH,
  AGENT_TOOL_TEST_TIMEOUT_SECONDS,
  AGENTS_ERROR_CODES,
  CONNECTIONS_ERROR_CODES,
  ERROR_CODES,
} from '@surefy/contracts'
import type {
  AgentToolFailureCode,
  DiscoverMcpActionsDto,
  DiscoverMcpActionsInput,
  TestAgentToolDto,
  TestAgentToolInput,
} from '@surefy/contracts'

import { API_TOOL_PROVIDER } from './agentTools.constants.js'
import { createScrubber } from './agentTools.scrub.js'
import { mergeDiscoveredActions } from './agentToolsMcp.js'
import { asFailureReason, openToolConnection, outboundFailure } from './agentToolsOutbound.js'
import { buildApiRequest } from './agentToolsRequest.js'

import type { AgentToolsConnections, AgentToolsContext } from './agentTools.types.js'
import type { McpToolAdapter } from './agentToolsMcp.js'

export interface ToolProbeDeps {
  connections: AgentToolsConnections
  http: OutboundHttp
  mcp: McpToolAdapter
  /** The clock for the "tested at" time; tests pass a fixed one. */
  now?: () => Date
}

const TIMEOUT_MS = AGENT_TOOL_TEST_TIMEOUT_SECONDS * 1000

const deadline = (): Promise<'timeout'> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('timeout')
    }, TIMEOUT_MS).unref()
  })

/**
 * Trying a tool while it is built (design/workspace/agents.md › Tools). Both calls take the tool
 * as it stands in the editor, go out through the same safe client and connections as a run, and
 * answer as data: a failed call is `ok: false` with a reason, never an HTTP error. Nothing is
 * stored and no run is created.
 */
export class ToolProbe {
  constructor(private readonly deps: ToolProbeDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  /** Sends the request an API tool would send, with the arguments given, as it stands. */
  async testApi(ctx: AgentToolsContext, input: TestAgentToolInput): Promise<TestAgentToolDto> {
    const built = buildApiRequest(
      {
        id: '00000000-0000-8000-8000-000000000000',
        kind: 'api',
        name: 'Test call',
        description: '',
        permission: 'read_only',
        enabled: true,
        method: input.method,
        url: input.url,
        headers: input.headers,
        inputSchema: null,
        connectionId: input.connectionId,
      },
      input.arguments,
    )
    if (!built.ok) {
      throw new UnprocessableError(ERROR_CODES.VALIDATION_FAILED, built.message, {
        details: [{ field: 'arguments' }],
      })
    }
    const { request } = built
    const opened = await openToolConnection(this.deps.connections, ctx, {
      connectionId: input.connectionId,
      address: input.url,
      provider: API_TOOL_PROVIDER,
      target: request.target,
    })
    if (!opened.ok) {
      return this.failure(
        opened.failure.reason ?? CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
      )
    }
    const { secret, headers: auth } = opened.connection
    const scrub = createScrubber(secret, auth)
    try {
      const result = await Promise.race([
        this.deps.http.external(request.url, {
          method: request.method,
          // the connection's credentials win over a header of the same name in the tool
          headers: { accept: 'application/json, */*;q=0.5', ...request.headers, ...auth },
          ...(request.body === undefined ? {} : { body: request.body }),
          timeoutMs: TIMEOUT_MS,
        }),
        deadline(),
      ])
      if (result === 'timeout') return this.failure(AGENT_RUNS_ERROR_CODES.AGENT_TOOL_TIMEOUT)
      const text = scrub(result.text)
      const truncated = text.length > AGENT_TOOL_TEST_PREVIEW_MAX_LENGTH
      const ok = result.status < 300
      return {
        ok,
        statusCode: result.status,
        latencyMs: Math.round(result.latencyMs),
        reasonCode: ok ? null : AGENTS_ERROR_CODES.AGENT_TOOL_HTTP_ERROR,
        responsePreview: text === '' ? null : text.slice(0, AGENT_TOOL_TEST_PREVIEW_MAX_LENGTH),
        truncated,
        testedAt: this.now().toISOString(),
      }
    } catch (error) {
      if (error instanceof OutboundError) {
        const reason = outboundFailure(error, request.target).reason
        return this.failure(reason ?? CONNECTIONS_ERROR_CODES.CONNECTION_UNREACHABLE)
      }
      throw error
    }
  }

  /** Connects to an MCP server and lists the actions it offers, each starting on. */
  async discover(
    ctx: AgentToolsContext,
    input: DiscoverMcpActionsInput,
  ): Promise<DiscoverMcpActionsDto> {
    const started = performance.now()
    const found = await Promise.race([
      this.deps.mcp.discover(ctx, input, { refresh: true }),
      deadline(),
    ])
    const discoveredAt = this.now().toISOString()
    if (found === 'timeout') {
      return {
        ok: false,
        latencyMs: null,
        reasonCode: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_TIMEOUT,
        actions: [],
        discoveredAt,
      }
    }
    if (!found.ok) {
      return {
        ok: false,
        latencyMs: null,
        reasonCode:
          found.reason ??
          asFailureReason(found.code) ??
          CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
        actions: [],
        discoveredAt,
      }
    }
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      reasonCode: null,
      actions: mergeDiscoveredActions(found.tools).map((action) => ({
        ...action,
        permission: null,
      })),
      discoveredAt,
    }
  }

  private failure(reasonCode: AgentToolFailureCode): TestAgentToolDto {
    return {
      ok: false,
      statusCode: null,
      latencyMs: null,
      reasonCode,
      responsePreview: null,
      truncated: false,
      testedAt: this.now().toISOString(),
    }
  }
}
