// SPDX-License-Identifier: AGPL-3.0-only
import type { AgentTool, AgentToolFailureCode, AgentToolPermission } from '@surefy/contracts'

import type {
  SearchResult,
  WebSearchOutcome,
  WebSearchRequest,
} from '@/integrations/search/index.js'
import type { ConnectionPrincipal, ConnectionUse } from '@/modules/connections/index.js'

/** The tool kinds this module runs; bridge actions and flows arrive in V2. */
export type ExecutableTool = Extract<AgentTool, { kind: 'api' | 'mcp' | 'web_search' }>

/** Web search as the tool uses it: the access policy's answer, and the search itself. */
export interface AgentToolsWebSearch {
  /** `AccessPolicy.tools.webSearch` of the person (the organization's, for runs without one). */
  allowed(orgId: string, userId: string | null): Promise<boolean>
  search(request: WebSearchRequest): Promise<WebSearchOutcome>
}

/** What a successful web search leaves in `ToolSuccess.data`: the `web_search` step shows it. */
export interface WebSearchToolData {
  provider: string
  /** The query as it left, after the personal-data filter. */
  query: string
  results: SearchResult[]
}

/** Connections as tools use them: opened for one call. */
export interface AgentToolsConnections {
  open(orgId: string, principal: ConnectionPrincipal, connectionId: string): Promise<ConnectionUse>
}

/** Who a call runs for: the organization, and the person whose access decides the connections it may use. */
export interface AgentToolsContext {
  orgId: string
  principal: ConnectionPrincipal
  /** The run a call belongs to, for the tools that filter and meter (web search); `seq` is the step. */
  run?: { runId: string; agentId: string; starterId: string | null; seq?: number }
}

/** One function the model may call: a whole API tool, or one action of an MCP server. */
export interface ResolvedTool {
  /** The function name in the model request: letters, digits, `_` and `-`, at most 64, unique in the agent. */
  callName: string
  toolId: string
  kind: ExecutableTool['kind']
  /** How the timeline names it: "Refund API", "Orders › lookup_order". */
  label: string
  /** The tool's name, and the name Guard rules match: the tool alone, or `{tool}.{action}` for MCP. */
  toolName: string
  action: string
  /** The MCP server's own name of the action; null for an API tool. */
  actionName: string | null
  description: string
  /** JSON Schema of the arguments the model fills in. */
  inputSchema: Record<string, unknown>
  /** What Guard goes by: the declared permission, raised when the server calls the action destructive. */
  permission: AgentToolPermission
  declaredPermission: AgentToolPermission
  definition: ExecutableTool
}

interface OutcomeBase {
  /** What was called, without credentials: `GET https://api.acme.test/orders/42`. */
  target: string
  attempts: number
}

export interface ToolSuccess extends OutcomeBase {
  ok: true
  /** What the model reads. */
  content: string
  /** The answer as data when it was JSON (or an MCP tool's structured content). */
  data: unknown
  truncated: boolean
  latencyMs: number
}

export interface ToolFailure extends OutcomeBase {
  ok: false
  /** `AGENT_TOOL_FAILED`, `AGENT_TOOL_TIMEOUT` or the connection's own code. */
  code: string
  /** Short and safe to show; also the first line of what the model reads. */
  message: string
  /** What the model reads: the message and, when there is one, an excerpt of the answer. */
  content: string
}

export type ToolOutcome = ToolSuccess | ToolFailure

/** One try, before the deadline, retries and truncation the service adds. */
export type Attempt =
  | { ok: true; content: string; data: unknown; target: string }
  | {
      ok: false
      code: string
      message: string
      content: string
      target: string
      /** Worth repeating when the tool only reads. */
      transient: boolean
      /** Nothing reached the target, so repeating is safe even for a tool that acts. */
      beforeSend: boolean
      /** Why, in the words of the editor's test call and discovery; unset for failures of a run. */
      reason?: AgentToolFailureCode
    }

export interface ToolAdapter {
  readonly kind: ExecutableTool['kind']
  resolve(ctx: AgentToolsContext, tool: ExecutableTool): Promise<ResolvedTool[]>
  attempt(
    ctx: AgentToolsContext,
    tool: ResolvedTool,
    args: Record<string, unknown>,
  ): Promise<Attempt>
}
