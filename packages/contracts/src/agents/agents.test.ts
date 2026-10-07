// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  AGENT_AUDIT_ACTIONS,
  AGENT_TOOLS_MAX,
  AGENTS_ERROR_CODES,
  AGENTS_PERMISSIONS,
  agentDefinitionObjectSchema,
  agentDefinitionSchema,
  agentDiffQuerySchema,
  agentTemplateDtoSchema,
  createAgentChannelInputSchema,
  createAgentInputSchema,
  createEmptyAgentDefinition,
  deleteAgentQuerySchema,
  diffAgentDefinitions,
  ERROR_CODES,
  listAgentsQuerySchema,
  publishAgentInputSchema,
  replaceAgentAccessInputSchema,
  ROLE_PERMISSIONS,
  saveAgentDraftInputSchema,
  updateAgentChannelInputSchema,
  updateAgentInputSchema,
} from '../index.js'

import type { AgentDefinition, AgentTool } from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const id2 = '0190a5c4-0000-7000-8000-000000000002'
const id3 = '0190a5c4-0000-7000-8000-000000000003'

const apiTool = (toolId: string, overrides: Partial<AgentTool> = {}): AgentTool =>
  ({
    kind: 'api',
    id: toolId,
    name: 'Refund API',
    description: 'Issues a refund',
    permission: 'ask_first',
    enabled: true,
    method: 'POST',
    url: 'https://api.acme.com/refunds',
    headers: [],
    inputSchema: null,
    connectionId: id,
    ...overrides,
  }) as AgentTool

const blank = (): AgentDefinition => createEmptyAgentDefinition('openai/gpt-4.1')

describe('agent definition', () => {
  it('starts blank and valid', () => {
    expect(agentDefinitionSchema.safeParse(blank()).success).toBe(true)
    expect(blank().model).toMatchObject({ modelKey: 'openai/gpt-4.1', useVaultFallback: true })
  })

  it('reads each tool kind by its own fields', () => {
    const tools: AgentTool[] = [
      apiTool(id),
      {
        kind: 'mcp',
        id: id2,
        name: 'Docs server',
        description: '',
        permission: 'read_only',
        enabled: true,
        serverUrl: 'https://mcp.acme.com',
        connectionId: null,
        discoveredActions: [{ name: 'search', description: '', enabled: true, permission: null }],
      },
      {
        kind: 'web_search',
        id: id3,
        name: 'Web',
        description: '',
        permission: 'read_only',
        enabled: false,
      },
    ]
    expect(agentDefinitionSchema.safeParse({ ...blank(), tools }).success).toBe(true)
    expect(
      agentDefinitionSchema.safeParse({
        ...blank(),
        tools: [apiTool(id, { permission: 'god' } as never)],
      }).success,
    ).toBe(false)
    expect(
      agentDefinitionSchema.safeParse({
        ...blank(),
        tools: [apiTool(id, { url: 'ftp-like' })],
      }).success,
    ).toBe(false)
  })

  it('keeps tool ids and guard rule ids unique, and limits the tool count', () => {
    expect(
      agentDefinitionSchema.safeParse({ ...blank(), tools: [apiTool(id), apiTool(id)] }).success,
    ).toBe(false)
    const match = { action: 'payments.refund' }
    const guard = (ids: string[]) => ({
      thresholds: null,
      approvalRules: [],
      actionLimits: [],
      blockedActions: ids.map((ruleId) => ({ id: ruleId, match })),
    })
    expect(agentDefinitionSchema.safeParse({ ...blank(), guard: guard(['a', 'b']) }).success).toBe(
      true,
    )
    expect(agentDefinitionSchema.safeParse({ ...blank(), guard: guard(['a', 'a']) }).success).toBe(
      false,
    )
    expect(
      agentDefinitionSchema.safeParse({ ...blank(), guard: guard(['has space']) }).success,
    ).toBe(false)
    const many = Array.from({ length: AGENT_TOOLS_MAX + 1 }, (_, i) =>
      apiTool(`0190a5c4-0000-7000-8000-${String(i).padStart(12, '0')}`),
    )
    expect(agentDefinitionSchema.safeParse({ ...blank(), tools: many }).success).toBe(false)
  })

  it('checks the agent Guard values and the model block', () => {
    const base = blank()
    expect(
      agentDefinitionSchema.safeParse({
        ...base,
        guard: { ...base.guard, thresholds: { autoBp: 9500, reviewBp: 7000 } },
      }).success,
    ).toBe(true)
    expect(
      agentDefinitionSchema.safeParse({ ...base, model: { ...base.model, creativity: 1.5 } })
        .success,
    ).toBe(false)
    expect(
      agentDefinitionSchema.safeParse({
        ...base,
        guard: {
          ...base.guard,
          approvalRules: [
            {
              id: 'r1',
              match: { action: 'x' },
              approvers: [{ type: 'role', id: 'admin' }],
              waitMinutes: 60,
              onTimeout: null,
              risk: 'high',
            },
          ],
        },
      }).success,
    ).toBe(false)
  })
})

describe('diffAgentDefinitions', () => {
  it('finds nothing between equal definitions', () => {
    expect(diffAgentDefinitions(blank(), blank())).toEqual([])
  })

  it('groups changes by editor tab', () => {
    const before = { ...blank(), tools: [apiTool(id), apiTool(id2, { name: 'Lookup' })] }
    const after: AgentDefinition = {
      ...before,
      instructions: 'Be helpful.',
      model: { ...before.model, creativity: 0.5 },
      tools: [apiTool(id, { permission: 'can_act' } as never), apiTool(id3, { name: 'New tool' })],
      knowledge: { ...before.knowledge, knowledgeBaseIds: [id] },
    }
    const changes = diffAgentDefinitions(before, after)
    const find = (section: string, kind: string, label?: string) =>
      changes.find(
        (change) =>
          change.section === section &&
          change.kind === kind &&
          (label === undefined || change.label === label),
      )
    expect(find('instructions', 'changed', 'instructions')).toBeDefined()
    expect(find('model', 'changed', 'creativity')).toMatchObject({ before: 0.3, after: 0.5 })
    expect(find('tools', 'added', 'New tool')).toBeDefined()
    expect(find('tools', 'removed', 'Lookup')).toBeDefined()
    expect(find('tools', 'changed', 'Refund API')).toBeDefined()
    expect(find('knowledge', 'changed', 'knowledgeBaseIds')).toBeDefined()
  })

  it('names added and removed Guard rules', () => {
    const rule = { id: 'r1', match: { action: 'payments.refund' } }
    const before = blank()
    const after = { ...before, guard: { ...before.guard, blockedActions: [rule] } }
    expect(diffAgentDefinitions(before, after)).toEqual([
      expect.objectContaining({
        section: 'guard',
        kind: 'added',
        label: 'Blocked payments.refund',
      }),
    ])
    expect(diffAgentDefinitions(after, before)).toEqual([
      expect.objectContaining({ section: 'guard', kind: 'removed' }),
    ])
  })
})

describe('agent inputs', () => {
  it('creates from a template or from scratch, and edits only live metadata', () => {
    expect(createAgentInputSchema.safeParse({ name: 'Support triage' }).success).toBe(true)
    expect(createAgentInputSchema.safeParse({ name: 'HR', templateKey: 'hr_helper' }).success).toBe(
      true,
    )
    expect(createAgentInputSchema.safeParse({ name: 'X', templateKey: 'unknown' }).success).toBe(
      false,
    )
    expect(createAgentInputSchema.safeParse({ name: '  ' }).success).toBe(false)
    expect(updateAgentInputSchema.safeParse({}).success).toBe(false)
    expect(updateAgentInputSchema.parse({ description: null })).toEqual({ description: null })
  })

  it('saves the draft against a base revision', () => {
    expect(
      saveAgentDraftInputSchema.safeParse({ baseRevision: 3, definition: blank() }).success,
    ).toBe(true)
    expect(
      saveAgentDraftInputSchema.safeParse({ baseRevision: 0, definition: blank() }).success,
    ).toBe(false)
    expect(saveAgentDraftInputSchema.safeParse({ definition: blank() }).success).toBe(false)
  })

  it('filters the list and reads the delete confirmation', () => {
    expect(listAgentsQuerySchema.parse({ status: 'paused' }).status).toEqual(['paused'])
    expect(listAgentsQuerySchema.parse({ needsAttention: 'true', mine: 'false' })).toMatchObject({
      needsAttention: true,
      mine: false,
    })
    expect(listAgentsQuerySchema.safeParse({ sort: '-runsThisWeek' }).success).toBe(true)
    expect(listAgentsQuerySchema.safeParse({ sort: 'trust' }).success).toBe(false)
    expect(
      deleteAgentQuerySchema.safeParse({ confirmName: 'Support', reason: 'Replaced' }).success,
    ).toBe(true)
    expect(deleteAgentQuerySchema.safeParse({ reason: '' }).success).toBe(false)
  })
})

describe('audience', () => {
  it('lets everyone use, and teams or people use or edit, once each', () => {
    const parse = (entries: unknown[]) =>
      replaceAgentAccessInputSchema.safeParse({ entries }).success
    expect(parse([{ subjectType: 'organization', level: 'use' }])).toBe(true)
    expect(parse([{ subjectType: 'organization', level: 'edit' }])).toBe(false)
    expect(
      parse([
        { subjectType: 'team', teamId: id, level: 'edit' },
        { subjectType: 'user', userId: id, level: 'use' },
      ]),
    ).toBe(true)
    expect(
      parse([
        { subjectType: 'team', teamId: id, level: 'use' },
        { subjectType: 'team', teamId: id, level: 'edit' },
      ]),
    ).toBe(false)
    expect(parse([{ subjectType: 'team', level: 'use' }])).toBe(false)
    expect(parse([])).toBe(true)
  })
})

describe('channels and publishing', () => {
  it('asks each channel type for its own settings', () => {
    const parse = (input: unknown) => createAgentChannelInputSchema.safeParse(input).success
    expect(parse({ type: 'api' })).toBe(true)
    expect(parse({ type: 'api', config: { rateLimitPerMinute: 60 } })).toBe(true)
    expect(parse({ type: 'api', config: { rateLimitPerMinute: 0 } })).toBe(false)
    expect(parse({ type: 'workspace_chat' })).toBe(false)
    const widget = {
      allowedOrigins: ['https://acme.com'],
      greeting: 'Hi',
      theme: 'auto',
      position: 'bottom_right',
    }
    expect(parse({ type: 'widget', config: widget })).toBe(true)
    expect(parse({ type: 'widget', config: { ...widget, allowedOrigins: [] } })).toBe(false)
    expect(parse({ type: 'widget', config: { ...widget, allowedOrigins: ['not a url'] } })).toBe(
      false,
    )
    const slack = { channelIds: ['C123'], respondTo: 'mentions' }
    expect(parse({ type: 'slack', config: slack })).toBe(false)
    expect(parse({ type: 'slack', connectionId: id, config: slack })).toBe(true)
    expect(
      parse({
        type: 'whatsapp',
        connectionId: id,
        config: { businessAccountId: 'b1', welcomeMessage: 'Hello' },
      }),
    ).toBe(true)
  })

  it('changes a channel by one block, never an empty update', () => {
    expect(updateAgentChannelInputSchema.safeParse({}).success).toBe(false)
    expect(
      updateAgentChannelInputSchema.safeParse({ api: { rateLimitPerMinute: 120 } }).success,
    ).toBe(true)
  })

  it('publishes against a base revision with optional audience and channels', () => {
    expect(publishAgentInputSchema.parse({ baseRevision: 2 })).toEqual({
      baseRevision: 2,
      channels: [],
    })
    expect(
      publishAgentInputSchema.safeParse({
        baseRevision: 2,
        notes: 'Added refunds',
        access: [{ subjectType: 'organization', level: 'use' }],
        channels: [{ type: 'api' }],
      }).success,
    ).toBe(true)
    expect(publishAgentInputSchema.safeParse({ notes: 'x' }).success).toBe(false)
    expect(agentDiffQuerySchema.parse({}).against).toBe('draft')
    expect(agentDiffQuerySchema.safeParse({ against: id }).success).toBe(true)
    expect(agentDiffQuerySchema.safeParse({ against: 'previous' }).success).toBe(false)
  })

  it('shows a template without a model and with how each tool is set up', () => {
    const definition = agentDefinitionObjectSchema.omit({ model: true }).parse(blank())
    expect(
      agentTemplateDtoSchema.safeParse({
        key: 'customer_support',
        name: 'Customer Support',
        description: 'Answers customers',
        tools: [
          {
            name: 'Slack',
            kind: 'bridge_action',
            permission: 'read_only',
            setup: 'bridge_not_installed',
            bridgeKey: 'slack',
          },
        ],
        knowledgeSuggestion: 'Your support articles',
        guardRules: ['Refunds over $200 need approval'],
        suggestedModel: null,
        definition,
      }).success,
    ).toBe(true)
  })
})

describe('agent codes, permissions and audit', () => {
  it('registers every error code', () => {
    for (const code of Object.values(AGENTS_ERROR_CODES)) expect(ERROR_CODES[code]).toBe(code)
  })

  it('lets every role invoke, Builders build, and only Admins manage all or publish externally', () => {
    const p = AGENTS_PERMISSIONS
    expect(ROLE_PERMISSIONS.user).toContain(p.AGENTS_INVOKE.key)
    expect(ROLE_PERMISSIONS.user).not.toContain(p.AGENTS_CREATE.key)
    for (const permission of [
      p.AGENTS_READ,
      p.AGENTS_CREATE,
      p.AGENTS_EDIT,
      p.AGENTS_PUBLISH,
      p.AGENTS_DELETE,
    ]) {
      expect(ROLE_PERMISSIONS.builder).toContain(permission.key)
    }
    expect(ROLE_PERMISSIONS.builder).not.toContain(p.AGENTS_MANAGE_ALL.key)
    expect(ROLE_PERMISSIONS.builder).not.toContain(p.AGENTS_PUBLISH_EXTERNAL.key)
    expect(ROLE_PERMISSIONS.admin).toContain(p.AGENTS_PUBLISH_EXTERNAL.key)
  })

  it('names audit actions <area>.<verb>', () => {
    for (const action of Object.values(AGENT_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^agent(_channel)?\.[a-z_]+$/)
    }
  })
})
