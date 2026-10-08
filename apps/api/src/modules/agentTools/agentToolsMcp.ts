// SPDX-License-Identifier: AGPL-3.0-only
import { McpError, MCP_TOOLS_MAX } from '@/integrations/mcp/index.js'
import { OutboundError } from '@/modules/connections/index.js'
import {
  AGENT_RUNS_ERROR_CODES,
  AGENTS_ERROR_CODES,
  CONNECTIONS_ERROR_CODES,
} from '@surefy/contracts'
import type { AgentMcpAction, AgentToolFailureCode } from '@surefy/contracts'

import { MCP_TOOL_PROVIDER, TRANSIENT_STATUSES } from './agentTools.constants.js'
import { slug } from './agentTools.names.js'
import { effectivePermission } from './agentTools.permissions.js'
import { createScrubber, scrubData } from './agentTools.scrub.js'
import { failed, openToolConnection, outboundFailure } from './agentToolsOutbound.js'
import { SchemaCache } from './agentToolsSchemas.js'

import type {
  AgentToolsConnections,
  AgentToolsContext,
  Attempt,
  ExecutableTool,
  ResolvedTool,
  ToolAdapter,
} from './agentTools.types.js'
import type { McpClient, McpToolInfo } from '@/integrations/mcp/index.js'

type McpTool = Extract<ExecutableTool, { kind: 'mcp' }>

export interface McpToolAdapterDeps {
  connections: AgentToolsConnections
  client: McpClient
  schemas: SchemaCache
}

/** Discovery of an MCP server's tools, as data: the actions found, or why not. */
export type Discovery =
  | { ok: true; tools: McpToolInfo[] }
  | { ok: false; code: string; message: string; reason?: AgentToolFailureCode }

const OPEN_OBJECT = { type: 'object', additionalProperties: true } as const

function describeFailure(error: unknown, target: string): Failed | null {
  if (error instanceof OutboundError) return outboundFailure(error, target)
  if (!(error instanceof McpError)) return null
  switch (error.kind) {
    case 'unauthorized':
      return failed(
        CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED,
        'The server refused the connection’s credentials',
        target,
        { reason: CONNECTIONS_ERROR_CODES.CONNECTION_PROVIDER_REJECTED },
      )
    case 'http':
      return failed(AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED, error.message, target, {
        transient: error.status !== null && TRANSIENT_STATUSES.has(error.status),
        reason: AGENTS_ERROR_CODES.AGENT_TOOL_HTTP_ERROR,
      })
    default:
      return failed(AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED, error.message, target, {
        reason: AGENTS_ERROR_CODES.AGENT_TOOL_BAD_RESPONSE,
      })
  }
}

type Failed = Extract<Attempt, { ok: false }>

const targetOf = (serverUrl: string, action?: string): string => {
  try {
    const { origin } = new URL(serverUrl)
    return action === undefined ? `MCP ${origin}` : `MCP ${action} @ ${origin}`
  } catch {
    return 'MCP'
  }
}

/** The MCP client as a tool adapter: each enabled action of a server is one function for the model. */
export class McpToolAdapter implements ToolAdapter {
  readonly kind = 'mcp'

  constructor(private readonly deps: McpToolAdapterDeps) {}

  /** What the server offers; read live, remembered for a few minutes. */
  async discover(
    ctx: AgentToolsContext,
    server: { serverUrl: string; connectionId: string | null },
    options: { refresh?: boolean } = {},
  ): Promise<Discovery> {
    const key = SchemaCache.key(ctx.orgId, server.connectionId, server.serverUrl)
    const cached = options.refresh === true ? undefined : this.deps.schemas.get(key)
    if (cached !== undefined) return { ok: true, tools: [...cached.values()] }

    const target = targetOf(server.serverUrl)
    const opened = await openToolConnection(this.deps.connections, ctx, {
      connectionId: server.connectionId,
      address: server.serverUrl,
      provider: MCP_TOOL_PROVIDER,
      target,
    })
    if (!opened.ok) return opened.failure
    const { headers } = opened.connection
    try {
      const tools = await this.deps.client.listTools({ url: server.serverUrl, headers })
      this.deps.schemas.set(key, tools)
      return { ok: true, tools }
    } catch (error) {
      const scrub = createScrubber(opened.connection.secret, headers)
      const failure = describeFailure(error, target)
      if (failure === null) throw error
      return {
        ok: false,
        code: failure.code,
        message: scrub(failure.message),
        ...(failure.reason === undefined ? {} : { reason: failure.reason }),
      }
    }
  }

  async resolve(ctx: AgentToolsContext, tool: ExecutableTool): Promise<ResolvedTool[]> {
    if (tool.kind !== 'mcp') return []
    const actions = tool.discoveredActions.filter((action) => action.enabled)
    if (actions.length === 0) return []
    // a server that cannot be reached now still offers its actions: the call reports why
    const found = await this.discover(ctx, tool)
    const info = new Map(found.ok ? found.tools.map((item) => [item.name, item]) : [])
    return actions.map((action) => this.resolveAction(tool, action, info.get(action.name)))
  }

  private resolveAction(
    tool: McpTool,
    action: AgentMcpAction,
    info: McpToolInfo | undefined,
  ): ResolvedTool {
    const declaredPermission = action.permission ?? tool.permission
    return {
      callName: `${slug(tool.name)}__${slug(action.name)}`,
      toolId: tool.id,
      kind: 'mcp',
      label: `${tool.name} › ${action.name}`,
      toolName: tool.name,
      action: `${tool.name}.${action.name}`,
      actionName: action.name,
      description:
        [action.description, info?.description, tool.description].find(
          (text) => text !== undefined && text !== '',
        ) ?? '',
      inputSchema: info?.inputSchema ?? { ...OPEN_OBJECT },
      permission: effectivePermission(declaredPermission, info ?? null),
      declaredPermission,
      definition: tool,
    }
  }

  async attempt(
    ctx: AgentToolsContext,
    resolved: ResolvedTool,
    args: Record<string, unknown>,
  ): Promise<Attempt> {
    const tool = resolved.definition as McpTool
    const actionName = resolved.actionName ?? ''
    const target = targetOf(tool.serverUrl, actionName)

    const opened = await openToolConnection(this.deps.connections, ctx, {
      connectionId: tool.connectionId,
      address: tool.serverUrl,
      provider: MCP_TOOL_PROVIDER,
      target,
    })
    if (!opened.ok) return opened.failure
    const { secret, headers } = opened.connection
    const scrub = createScrubber(secret, headers)

    try {
      const result = await this.deps.client.callTool(
        { url: tool.serverUrl, headers },
        actionName,
        args,
      )
      const text = scrub(result.text)
      if (result.isError) {
        return failed(
          AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
          'The tool reported an error',
          target,
          {
            content: text === '' ? 'The tool reported an error' : text,
          },
        )
      }
      return { ok: true, content: text, data: scrubData(result.structuredContent, scrub), target }
    } catch (error) {
      const failure = describeFailure(error, target)
      if (failure === null) throw error
      return { ...failure, message: scrub(failure.message), content: scrub(failure.content) }
    }
  }
}

/**
 * The `discoveredActions` of a definition for what a server offers now: a new action starts
 * enabled with the server's own permission, a known one keeps the switches the builder set, and
 * an action the server dropped disappears. Capped at what a definition can hold.
 */
export function mergeDiscoveredActions(
  found: readonly McpToolInfo[],
  previous: readonly AgentMcpAction[] = [],
): AgentMcpAction[] {
  const before = new Map(previous.map((action) => [action.name, action]))
  return found.slice(0, MCP_TOOLS_MAX).map((info) => {
    const known = before.get(info.name)
    return {
      name: info.name,
      description: known?.description ?? info.description.slice(0, 1000),
      enabled: known?.enabled ?? true,
      permission: known?.permission ?? null,
    }
  })
}
