// SPDX-License-Identifier: AGPL-3.0-only
import type {
  AgentGuard,
  AgentMcpAction,
  AgentTool,
  AgentToolPermission,
  ConnectionDto,
} from '@surefy/contracts'

import type { BuildableToolKind } from './ToolsTab.types'

type ApiTool = Extract<AgentTool, { kind: 'api' }>
type McpTool = Extract<AgentTool, { kind: 'mcp' }>

/** An id for a tool inside the agent: lasts as long as the tool does. */
export function newToolId(): string {
  return globalThis.crypto.randomUUID()
}

export const isApiTool = (tool: AgentTool): tool is ApiTool => tool.kind === 'api'
export const isMcpTool = (tool: AgentTool): tool is McpTool => tool.kind === 'mcp'

/** The tools this tab can edit; the others are only listed, switched and removed. */
export function isBuildable(tool: AgentTool): tool is ApiTool | McpTool {
  return isApiTool(tool) || isMcpTool(tool)
}

/** The connection a tool uses, when its kind uses one. */
export function connectionIdOf(tool: AgentTool): string | null {
  return tool.kind === 'api' || tool.kind === 'mcp' || tool.kind === 'bridge_action'
    ? tool.connectionId
    : null
}

/**
 * Whether the tool still has to be connected before the agent can be published. An API tool may
 * call an open address without a connection; MCP servers and bridge actions need one.
 */
export function needsConnection(tool: AgentTool): boolean {
  return (tool.kind === 'mcp' || tool.kind === 'bridge_action') && tool.connectionId === null
}

/** The host of an address ("api.example.com"), or the address itself when it is not one. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** A "Can act" tool that is on and has no approval rule for its name: Guard suggests one. */
export function lacksApprovalRule(tool: AgentTool, rules: AgentGuard['approvalRules']): boolean {
  return (
    tool.enabled &&
    tool.permission === 'can_act' &&
    !rules.some((rule) => rule.match.action === tool.name)
  )
}

/** A name no other tool has (compared without case), so a rule and the model can tell them apart. */
export function isNameTaken(name: string, tools: readonly AgentTool[], ownId?: string): boolean {
  const wanted = name.trim().toLowerCase()
  return tools.some((tool) => tool.id !== ownId && tool.name.trim().toLowerCase() === wanted)
}

/** Replaces the tool with the same id, or adds the tool at the end. */
export function upsertTool(tools: readonly AgentTool[], tool: AgentTool): AgentTool[] {
  return tools.some(({ id }) => id === tool.id)
    ? tools.map((current) => (current.id === tool.id ? tool : current))
    : [...tools, tool]
}

/** Puts a removed tool back where it was. */
export function insertTool(
  tools: readonly AgentTool[],
  tool: AgentTool,
  index: number,
): AgentTool[] {
  if (tools.some(({ id }) => id === tool.id)) return [...tools]
  const next = [...tools]
  next.splice(Math.min(index, next.length), 0, tool)
  return next
}

export function changeToolPermission(
  tools: readonly AgentTool[],
  toolId: string,
  permission: AgentToolPermission,
): AgentTool[] {
  return tools.map((tool) => (tool.id === toolId ? { ...tool, permission } : tool))
}

export function changeToolEnabled(
  tools: readonly AgentTool[],
  toolId: string,
  enabled: boolean,
): AgentTool[] {
  return tools.map((tool) => (tool.id === toolId ? { ...tool, enabled } : tool))
}

/**
 * The actions of a server after discovery: those found now, keeping what the person set for an
 * action of the same name (on or off, its own permission). Actions the server no longer offers go.
 */
export function mergeDiscoveredActions(
  found: readonly AgentMcpAction[],
  current: readonly AgentMcpAction[],
): AgentMcpAction[] {
  return found.map((action) => {
    const kept = current.find(({ name }) => name === action.name)
    return kept ? { ...action, enabled: kept.enabled, permission: kept.permission } : action
  })
}

export function changeAction(
  actions: readonly AgentMcpAction[],
  name: string,
  patch: Partial<Pick<AgentMcpAction, 'enabled' | 'permission'>>,
): AgentMcpAction[] {
  return actions.map((action) => (action.name === name ? { ...action, ...patch } : action))
}

/** The connections a kind of tool can pick from, usable ones that are not disconnected. */
export function connectionsFor(
  connections: readonly ConnectionDto[],
  kind: BuildableToolKind,
): ConnectionDto[] {
  const wanted = kind === 'api' ? 'api_tool' : 'mcp_server'
  return connections.filter(
    (connection) => connection.kind === wanted && connection.status !== 'revoked',
  )
}
