// SPDX-License-Identifier: AGPL-3.0-only
import { OutboundError, type OutboundHttp } from '@/modules/connections/index.js'
import { AGENT_RUNS_ERROR_CODES, AGENT_TOOL_TIMEOUT_MS } from '@surefy/contracts'

import {
  API_TOOL_PROVIDER,
  AGENT_TOOL_ERROR_EXCERPT_CHARS,
  TRANSIENT_STATUSES,
} from './agentTools.constants.js'
import { slug } from './agentTools.names.js'
import { readOnlyViolation } from './agentTools.permissions.js'
import { createScrubber } from './agentTools.scrub.js'
import { failed, openToolConnection, outboundFailure } from './agentToolsOutbound.js'
import { apiInputSchema, buildApiRequest } from './agentToolsRequest.js'

import type {
  AgentToolsConnections,
  AgentToolsContext,
  Attempt,
  ExecutableTool,
  ResolvedTool,
  ToolAdapter,
} from './agentTools.types.js'

type ApiTool = Extract<ExecutableTool, { kind: 'api' }>

export interface ApiToolAdapterDeps {
  connections: AgentToolsConnections
  http: OutboundHttp
}

const looksLikeJson = (contentType: string | undefined, text: string): boolean =>
  (contentType ?? '').toLowerCase().includes('json') || /^\s*[[{]/.test(text)

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** The API tool caller: one HTTP request to the address of the tool, through the safe outbound client. */
export class ApiToolAdapter implements ToolAdapter {
  readonly kind = 'api'

  constructor(private readonly deps: ApiToolAdapterDeps) {}

  resolve(_ctx: AgentToolsContext, tool: ExecutableTool): Promise<ResolvedTool[]> {
    if (tool.kind !== 'api') return Promise.resolve([])
    return Promise.resolve([
      {
        callName: slug(tool.name),
        toolId: tool.id,
        kind: 'api',
        label: tool.name,
        toolName: tool.name,
        action: tool.name,
        actionName: null,
        description: tool.description,
        inputSchema: apiInputSchema(tool),
        permission: tool.permission,
        declaredPermission: tool.permission,
        definition: tool,
      },
    ])
  }

  async attempt(
    ctx: AgentToolsContext,
    resolved: ResolvedTool,
    args: Record<string, unknown>,
  ): Promise<Attempt> {
    const tool = resolved.definition as ApiTool
    const generic = failedTarget(tool)

    const violation = readOnlyViolation(tool, resolved.permission)
    if (violation !== null) {
      return failed(AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED, violation, generic)
    }
    const built = buildApiRequest(tool, args)
    if (!built.ok) {
      return failed(AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED, built.message, generic)
    }
    const { request } = built

    const opened = await openToolConnection(this.deps.connections, ctx, {
      connectionId: tool.connectionId,
      address: tool.url,
      provider: API_TOOL_PROVIDER,
      target: request.target,
    })
    if (!opened.ok) return opened.failure
    const { secret, headers: auth } = opened.connection
    const scrub = createScrubber(secret, auth)

    let result
    try {
      result = await this.deps.http.external(request.url, {
        method: request.method,
        // the connection's credentials win over a header of the same name in the tool
        headers: { accept: 'application/json, */*;q=0.5', ...request.headers, ...auth },
        ...(request.body === undefined ? {} : { body: request.body }),
        timeoutMs: AGENT_TOOL_TIMEOUT_MS,
      })
    } catch (error) {
      if (error instanceof OutboundError) return outboundFailure(error, request.target)
      throw error
    }
    return this.read(result, request.target, scrub)
  }

  private read(
    result: { status: number; headers: Record<string, string>; text: string },
    target: string,
    scrub: (text: string) => string,
  ): Attempt {
    const text = scrub(result.text)
    if (result.status >= 300 && result.status < 400) {
      return failed(
        AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
        `The address redirects (HTTP ${String(result.status)}); the tool needs the final address`,
        target,
      )
    }
    if (result.status >= 400) {
      const message = `The server answered HTTP ${String(result.status)}`
      const excerpt = text.slice(0, AGENT_TOOL_ERROR_EXCERPT_CHARS)
      return failed(AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED, message, target, {
        content: excerpt === '' ? message : `${message}\n${excerpt}`,
        transient: TRANSIENT_STATUSES.has(result.status),
      })
    }
    return {
      ok: true,
      content: text,
      data: looksLikeJson(result.headers['content-type'], text) ? parseJson(text) : null,
      target,
    }
  }
}

function failedTarget(tool: ApiTool): string {
  try {
    return `${tool.method} ${new URL(tool.url).origin}`
  } catch {
    return tool.method
  }
}
