// SPDX-License-Identifier: AGPL-3.0-only
import { AGENT_RUNS_ERROR_CODES, AGENT_TOOL_TIMEOUT_MS } from '@surefy/contracts'
import type { AgentMcpAction, AgentTool } from '@surefy/contracts'

import { AGENT_TOOL_RESULT_MAX_CHARS, AGENT_TOOL_RETRY_DELAYS_MS } from './agentTools.constants.js'
import { assignCallNames } from './agentTools.names.js'
import { mayRetry } from './agentTools.permissions.js'
import { mergeDiscoveredActions } from './agentToolsMcp.js'

import type {
  AgentToolsContext,
  Attempt,
  ExecutableTool,
  ResolvedTool,
  ToolAdapter,
  ToolOutcome,
} from './agentTools.types.js'
import type { McpToolAdapter } from './agentToolsMcp.js'

export interface AgentToolsServiceDeps {
  adapters: readonly ToolAdapter[]
  mcp: McpToolAdapter
  /** One attempt, including the safe outbound fetch. */
  timeoutMs?: number
  retryDelaysMs?: readonly number[]
  /** Replaced in tests so retries do not wait. */
  sleep?: (ms: number) => Promise<void>
}

const isExecutable = (tool: AgentTool): tool is ExecutableTool =>
  tool.kind === 'api' || tool.kind === 'mcp' || tool.kind === 'web_search'

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * The tool adapters as the executor uses them (agent-runs.md, §5): `resolve` turns the tools of a
 * definition into the functions the model may call, `execute` runs one call and returns what
 * happened as data. It never writes steps and never decides whether a call may run: Guard did that
 * before `execute` is called. What it does enforce is the tool's own permission (a Read only
 * tool never writes), the deadline of a call and the retry rule.
 */
export class AgentToolsService {
  private readonly adapters = new Map<string, ToolAdapter>()
  private readonly timeoutMs: number
  private readonly retryDelaysMs: readonly number[]
  private readonly sleep: (ms: number) => Promise<void>

  constructor(private readonly deps: AgentToolsServiceDeps) {
    for (const adapter of deps.adapters) this.adapters.set(adapter.kind, adapter)
    this.timeoutMs = deps.timeoutMs ?? AGENT_TOOL_TIMEOUT_MS
    this.retryDelaysMs = deps.retryDelaysMs ?? AGENT_TOOL_RETRY_DELAYS_MS
    this.sleep = deps.sleep ?? defaultSleep
  }

  /**
   * The functions the model is offered for these tools: enabled `api`, `mcp` and `web_search` tools (one
   * function per enabled MCP action), in the order of the definition, with unique names. Other
   * kinds belong to other adapters and are skipped here.
   */
  async resolve(ctx: AgentToolsContext, tools: readonly AgentTool[]): Promise<ResolvedTool[]> {
    const resolved = await Promise.all(
      tools.filter(isExecutable).map(async (tool) => {
        const adapter = this.adapters.get(tool.kind)
        return tool.enabled && adapter !== undefined ? adapter.resolve(ctx, tool) : []
      }),
    )
    const all = resolved.flat()
    const names = assignCallNames(all.map((item) => item.callName))
    return all.map((item, index) => ({ ...item, callName: names[index] ?? item.callName }))
  }

  /**
   * Runs one call. A read-only tool is repeated after a transient failure and any tool after a
   * failure before the request left (two retries, 1 s and 4 s); a call that acts and may have
   * arrived is not, a person retries it. Every attempt has the tool deadline.
   */
  async execute(
    ctx: AgentToolsContext,
    tool: ResolvedTool,
    args: Record<string, unknown>,
  ): Promise<ToolOutcome> {
    const adapter = this.adapters.get(tool.kind)
    const started = performance.now()
    for (let attempts = 1; ; attempts += 1) {
      const result =
        adapter === undefined
          ? unsupportedKind(tool)
          : await this.withDeadline(tool, adapter.attempt(ctx, tool, args))
      const delay = this.retryDelaysMs[attempts - 1]
      if (!result.ok && delay !== undefined && mayRetry(tool.permission, result)) {
        await this.sleep(delay)
        continue
      }
      return result.ok
        ? this.success(result, attempts, Math.round(performance.now() - started))
        : this.failure(result, attempts)
    }
  }

  /**
   * What an MCP server offers, as the `discoveredActions` of a tool. `previous` carries over the
   * switches the builder already set. Used when a server is added and by "Refresh actions".
   */
  async discoverMcpActions(
    ctx: AgentToolsContext,
    server: {
      serverUrl: string
      connectionId: string | null
      previous?: readonly AgentMcpAction[]
    },
  ): Promise<
    { ok: true; actions: AgentMcpAction[] } | { ok: false; code: string; message: string }
  > {
    const found = await this.deps.mcp.discover(ctx, server, { refresh: true })
    return found.ok
      ? { ok: true, actions: mergeDiscoveredActions(found.tools, server.previous) }
      : { ok: false, code: found.code, message: found.message }
  }

  private withDeadline(tool: ResolvedTool, attempt: Promise<Attempt>): Promise<Attempt> {
    // the call keeps running after the deadline; its late answer is dropped, never unhandled
    attempt.catch(() => {
      // its failure belongs to nobody once the deadline has passed
    })
    let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<Attempt>((resolve) => {
      timer = setTimeout(() => {
        resolve({
          ok: false,
          code: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_TIMEOUT,
          message: 'The tool did not answer in time',
          content: 'The tool did not answer in time',
          target: tool.label,
          transient: true,
          beforeSend: false,
        })
      }, this.timeoutMs)
    })
    return Promise.race([attempt, deadline]).finally(() => {
      clearTimeout(timer)
    })
  }

  private success(
    result: Extract<Attempt, { ok: true }>,
    attempts: number,
    latencyMs: number,
  ): ToolOutcome {
    const truncated = result.content.length > AGENT_TOOL_RESULT_MAX_CHARS
    return {
      ok: true,
      content: truncated ? result.content.slice(0, AGENT_TOOL_RESULT_MAX_CHARS) : result.content,
      // a cut answer has no complete data to offer
      data: truncated ? null : result.data,
      truncated,
      latencyMs,
      target: result.target,
      attempts,
    }
  }

  private failure(result: Extract<Attempt, { ok: false }>, attempts: number): ToolOutcome {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      content: result.content.slice(0, AGENT_TOOL_RESULT_MAX_CHARS),
      target: result.target,
      attempts,
    }
  }
}

/** A tool whose kind has no adapter registered (a definition from a newer version). */
function unsupportedKind(tool: ResolvedTool): Attempt {
  return {
    ok: false,
    code: AGENT_RUNS_ERROR_CODES.AGENT_TOOL_FAILED,
    message: 'This kind of tool cannot run here',
    content: 'This kind of tool cannot run here',
    target: tool.label,
    transient: false,
    beforeSend: false,
  }
}
