// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import type { AgentGuard, AgentMcpAction, AgentTool } from '@surefy/contracts'
import { fixtureUuid } from '@surefy/web-core/testing'

import {
  changeAction,
  changeToolEnabled,
  changeToolPermission,
  connectionIdOf,
  hostOf,
  insertTool,
  isNameTaken,
  lacksApprovalRule,
  mergeDiscoveredActions,
  needsConnection,
  upsertTool,
} from './ToolsTab.utils'

const tool = (n: number, patch: Partial<AgentTool> = {}): AgentTool =>
  ({
    id: fixtureUuid(75, n),
    kind: 'api',
    name: `Tool ${n}`,
    description: '',
    permission: 'read_only',
    enabled: true,
    method: 'GET',
    url: 'https://api.example.com',
    headers: [],
    inputSchema: null,
    connectionId: null,
    ...patch,
  }) as AgentTool

const action = (name: string, patch: Partial<AgentMcpAction> = {}): AgentMcpAction => ({
  name,
  description: '',
  enabled: true,
  permission: null,
  ...patch,
})

describe('tool list helpers', () => {
  it('replaces a tool with the same id, or adds a new one at the end', () => {
    const tools = [tool(1), tool(2)]
    expect(upsertTool(tools, tool(2, { name: 'Renamed' })).map(({ name }) => name)).toEqual([
      'Tool 1',
      'Renamed',
    ])
    expect(upsertTool(tools, tool(3)).map(({ name }) => name)).toEqual([
      'Tool 1',
      'Tool 2',
      'Tool 3',
    ])
  })

  it('puts a removed tool back where it was, and never twice', () => {
    const tools = [tool(1), tool(3)]
    expect(insertTool(tools, tool(2), 1).map(({ name }) => name)).toEqual([
      'Tool 1',
      'Tool 2',
      'Tool 3',
    ])
    expect(insertTool(tools, tool(3), 0)).toHaveLength(2)
    expect(insertTool(tools, tool(4), 9).map(({ name }) => name)).toEqual([
      'Tool 1',
      'Tool 3',
      'Tool 4',
    ])
  })

  it('changes only the tool asked for', () => {
    const tools = [tool(1), tool(2)]
    expect(changeToolPermission(tools, tool(2).id, 'can_act').map((t) => t.permission)).toEqual([
      'read_only',
      'can_act',
    ])
    expect(changeToolEnabled(tools, tool(1).id, false).map((t) => t.enabled)).toEqual([false, true])
  })

  it('compares names without case or surrounding spaces, and not against the tool itself', () => {
    const tools = [tool(1, { name: 'Order lookup' })]
    expect(isNameTaken('  order LOOKUP ', tools)).toBe(true)
    expect(isNameTaken('Order lookup', tools, tool(1).id)).toBe(false)
    expect(isNameTaken('Refunds', tools)).toBe(false)
  })
})

describe('connections of a tool', () => {
  it('reads the connection of the kinds that have one', () => {
    const id = fixtureUuid(76, 1)
    expect(connectionIdOf(tool(1, { connectionId: id }))).toBe(id)
    expect(connectionIdOf({ ...tool(1), kind: 'web_search' })).toBeNull()
  })

  it('needs a connection for an MCP server but not for an open API', () => {
    expect(needsConnection(tool(1))).toBe(false)
    expect(needsConnection({ ...tool(1), kind: 'mcp', connectionId: null } as AgentTool)).toBe(true)
    expect(
      needsConnection({ ...tool(1), kind: 'mcp', connectionId: fixtureUuid(76, 1) } as AgentTool),
    ).toBe(false)
  })

  it('shows the host of an address, or the text when it is not one', () => {
    expect(hostOf('https://api.example.com:8443/orders?id=1')).toBe('api.example.com:8443')
    expect(hostOf('not an address')).toBe('not an address')
  })
})

describe('lacksApprovalRule', () => {
  const rule = (name: string) =>
    ({ match: { action: name } }) as unknown as AgentGuard['approvalRules'][number]

  it('flags an enabled "Can act" tool no rule names', () => {
    const acting = tool(1, { permission: 'can_act', name: 'Refund' })
    expect(lacksApprovalRule(acting, [])).toBe(true)
    expect(lacksApprovalRule(acting, [rule('Refund')])).toBe(false)
    expect(lacksApprovalRule({ ...acting, enabled: false }, [])).toBe(false)
    expect(lacksApprovalRule(tool(2, { permission: 'ask_first' }), [])).toBe(false)
  })
})

describe('mergeDiscoveredActions', () => {
  it('keeps what was set for actions that are still there and drops the ones that are gone', () => {
    const merged = mergeDiscoveredActions(
      [action('search'), action('create'), action('archive')],
      [
        action('search', { enabled: false }),
        action('create', { permission: 'ask_first' }),
        action('removed'),
      ],
    )
    expect(merged).toEqual([
      action('search', { enabled: false }),
      action('create', { permission: 'ask_first' }),
      action('archive'),
    ])
  })

  it('changes one action by name', () => {
    expect(
      changeAction([action('a'), action('b')], 'b', { enabled: false }).map((a) => a.enabled),
    ).toEqual([true, false])
  })
})
