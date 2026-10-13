// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { agents, agentVersions, auditLogs, outboxEvents } from '@/database/tables/index.js'
import {
  agentAccessDtoSchema,
  agentDetailDtoSchema,
  agentDiffDtoSchema,
  agentDtoSchema,
  agentReadinessDtoSchema,
  agentVersionDetailDtoSchema,
  agentVersionDtoSchema,
  AGENTS_ERROR_CODES,
  connectionDtoSchema,
  CONNECTIONS_ERROR_CODES,
  ERROR_CODES,
} from '@surefy/contracts'
import type { AgentDefinition, AgentReadinessItemKey, AgentTool } from '@surefy/contracts'

import { setupAgents, type AgentsSetup } from './agentsTestKit.js'
import { testKey } from '../../../../test/fixtures/fakeAi.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'

const versionRows = (setup: AgentsSetup, agentId: string) =>
  setup.db.system('test', (tx) =>
    tx.select().from(agentVersions).where(eq(agentVersions.agentId, agentId)),
  )

const rowOf = (setup: AgentsSetup, agentId: string) =>
  setup.db.system('test', async (tx) => {
    const [row] = await tx.select().from(agents).where(eq(agents.id, agentId))
    return row
  })

const eventsOf = (setup: AgentsSetup, topic: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.organizationId, setup.a.id), eq(outboxEvents.topic, topic))),
  )

const auditOf = (setup: AgentsSetup, action: string) =>
  setup.db.system('test', (tx) =>
    tx
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, action))),
  )

const readinessOf = async (setup: AgentsSetup, agentId: string) =>
  expectData(
    await setup.call('bella', 'GET', `/${agentId}/readiness`),
    200,
    agentReadinessDtoSchema,
  )

const itemOf = (readiness: Awaited<ReturnType<typeof readinessOf>>, key: AgentReadinessItemKey) => {
  const item = readiness.items.find((candidate) => candidate.key === key)
  if (item === undefined) throw new Error(`no readiness item ${key}`)
  return item
}

/** Saves the draft with `change` applied, on the draft's current revision. */
async function edit(
  setup: AgentsSetup,
  agent: { id: string },
  change: (definition: AgentDefinition) => AgentDefinition,
  who: 'bella' | 'ben' = 'bella',
) {
  const draft = expectData(
    await setup.call(who, 'GET', `/${agent.id}`),
    200,
    agentDetailDtoSchema,
  ).draft
  return setup.saveDraft(who, agent, draft.revision, change(draft.definition))
}

const apiTool = (overrides: Partial<Extract<AgentTool, { kind: 'api' }>> = {}): AgentTool => ({
  id: randomUUID(),
  kind: 'api',
  name: 'Look up order',
  description: 'Finds an order',
  permission: 'read_only',
  enabled: true,
  method: 'GET',
  url: 'https://api.acme.test/orders',
  headers: [],
  inputSchema: null,
  connectionId: null,
  ...overrides,
})

const mcpTool = (connectionId: string | null): AgentTool => ({
  id: randomUUID(),
  kind: 'mcp',
  name: 'Orders server',
  description: 'Orders',
  permission: 'read_only',
  enabled: true,
  serverUrl: 'https://mcp.acme.test/mcp',
  connectionId,
  discoveredActions: [],
})

async function addConnection(setup: AgentsSetup, host = 'api.acme.test'): Promise<string> {
  setup.http.on(host, { body: {} })
  return expectData(
    await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/connections`, {
      headers: setup.sessionOf(setup.a.members.adam),
      payload: {
        providerKey: 'http',
        authType: 'api_key',
        secret: testKey('agents'),
        baseUrl: `https://${host}`,
        name: `API ${host}`,
        scope: 'organization',
      },
    }),
    201,
    connectionDtoSchema,
  ).id
}

describe('the readiness check', () => {
  it('blocks publishing until the instructions are written, and only warns about the rest', async () => {
    const setup = await setupAgents()
    const agent = expectData(
      await setup.call('bella', 'POST', '', { name: 'Blank' }),
      201,
      agentDetailDtoSchema,
    )
    const blank = await readinessOf(setup, agent.id)
    expect(blank.canPublish).toBe(false)
    expect(itemOf(blank, 'instructions_present')).toMatchObject({
      severity: 'blocking',
      passed: false,
      tab: 'instructions',
    })
    expect(blank.items.map((item) => item.key)).toEqual([
      'instructions_present',
      'model_allowed_for_audience',
      'tools_connected',
      'guard_not_looser',
      'tested_since_change',
      'can_act_without_approval_rule',
    ])

    await edit(setup, agent, (definition) => ({ ...definition, instructions: 'Help.' }))
    const ready = await readinessOf(setup, agent.id)
    expect(ready.canPublish).toBe(true)
    // nobody has tried the draft, which is only a warning
    expect(itemOf(ready, 'tested_since_change')).toMatchObject({
      severity: 'warning',
      passed: false,
      tab: 'test',
    })
  })

  it('warns about a tool that can act when no approval rule covers it', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const refund = apiTool({ name: 'Issue refund', permission: 'can_act', method: 'POST' })
    await edit(setup, agent, (definition) => ({ ...definition, tools: [refund] }))
    const unguarded = itemOf(await readinessOf(setup, agent.id), 'can_act_without_approval_rule')
    expect(unguarded).toMatchObject({ passed: false, severity: 'warning', tab: 'guard' })
    expect(unguarded.failures).toEqual([{ type: 'tool', id: refund.id, name: 'Issue refund' }])

    await edit(setup, agent, (definition) => ({
      ...definition,
      guard: {
        ...definition.guard,
        approvalRules: [
          {
            id: 'refunds',
            match: { action: 'Issue refund' },
            approvers: [{ type: 'role', id: 'admin' }],
            waitMinutes: null,
            onTimeout: null,
            escalateTo: [],
            risk: 'high',
          },
        ],
      },
    }))
    expect(itemOf(await readinessOf(setup, agent.id), 'can_act_without_approval_rule').passed).toBe(
      true,
    )
  })

  it('blocks Guard thresholds below the organization’s', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await edit(setup, agent, (definition) => ({
      ...definition,
      guard: { ...definition.guard, thresholds: { autoBp: 5000, reviewBp: 3000 } },
    }))
    const readiness = await readinessOf(setup, agent.id)
    expect(readiness.canPublish).toBe(false)
    expect(itemOf(readiness, 'guard_not_looser').failures.map((failure) => failure.name)).toEqual([
      'Automatic threshold',
      'Review threshold',
    ])
  })

  it('needs a working connection for every enabled tool that needs one', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await edit(setup, agent, (definition) => ({ ...definition, tools: [mcpTool(null)] }))
    const missing = itemOf(await readinessOf(setup, agent.id), 'tools_connected')
    expect(missing).toMatchObject({ passed: false, severity: 'blocking', tab: 'tools' })
    expect(missing.failures).toEqual([
      expect.objectContaining({ type: 'tool', name: 'Orders server' }),
    ])

    const connectionId = await addConnection(setup)
    await edit(setup, agent, (definition) => ({
      ...definition,
      tools: [mcpTool(connectionId), apiTool()],
    }))
    expect(itemOf(await readinessOf(setup, agent.id), 'tools_connected').passed).toBe(true)

    expectData(
      await request(
        setup.app,
        'POST',
        `/api/v1/orgs/${setup.a.id}/connections/${connectionId}/revoke`,
        { headers: setup.sessionOf(setup.a.members.adam) },
      ),
      200,
      connectionDtoSchema,
    )
    const revoked = await readinessOf(setup, agent.id)
    expect(itemOf(revoked, 'tools_connected').passed).toBe(false)
    expect(revoked.canPublish).toBe(false)
  })

  it('keeps saving a draft whose connection was revoked, but refuses a revoked one on a new tool', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const held = await addConnection(setup)
    const gone = await addConnection(setup, 'api.other.test')
    await edit(setup, agent, (definition) => ({ ...definition, tools: [mcpTool(held)] }))
    for (const id of [held, gone]) {
      await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/connections/${id}/revoke`, {
        headers: setup.sessionOf(setup.a.members.adam),
      })
    }
    // the connection is already part of the draft: other edits still save
    await edit(setup, agent, (definition) => ({ ...definition, instructions: 'Still saves.' }))
    // a tool newly naming a revoked one does not
    const draft = expectData(
      await setup.call('bella', 'GET', `/${agent.id}/draft`),
      200,
      agentDetailDtoSchema.shape.draft,
    )
    expectError(
      await setup.call('bella', 'PUT', `/${agent.id}/draft`, {
        baseRevision: draft.revision,
        definition: {
          ...draft.definition,
          tools: [...draft.definition.tools, apiTool({ connectionId: gone })],
        },
      }),
      409,
      'CONNECTION_REVOKED',
    )
  })

  it('marks an agent whose live tool lost its connection as needing attention', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const connectionId = await addConnection(setup)
    await edit(setup, agent, (definition) => ({ ...definition, tools: [mcpTool(connectionId)] }))
    const current = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    await setup.publish('bella', agent.id, { baseRevision: current.draft.revision, channels: [] })
    const list = async (query: Record<string, string> = {}) =>
      expectPage(await setup.call('adam', 'GET', '', undefined, query), agentDtoSchema).data
    expect((await list())[0]?.needsAttention).toEqual([])
    expect(await list({ needsAttention: 'true' })).toEqual([])

    await request(
      setup.app,
      'POST',
      `/api/v1/orgs/${setup.a.id}/connections/${connectionId}/revoke`,
      {
        headers: setup.sessionOf(setup.a.members.adam),
      },
    )
    const attention = await list({ needsAttention: 'true' })
    expect(attention.map((entry) => [entry.id, entry.needsAttention])).toEqual([
      [agent.id, ['connection_failed']],
    ])
  })
})

describe('publishing', () => {
  it('freezes the draft as version 1, goes live and starts the next revision', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella', { instructions: 'Version one.' })
    const result = await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      notes: 'First release',
      channels: [],
    })
    expect(result.version).toMatchObject({
      version: 1,
      notes: 'First release',
      isLive: true,
      publishedBy: { id: setup.builders.bella.id },
    })
    expect(result.agent).toMatchObject({
      status: 'active',
      liveVersion: 1,
      hasUnpublishedChanges: false,
    })
    // SurefyOS chat is on with the first publish
    expect(result.channels.map((channel) => [channel.type, channel.status])).toEqual([
      ['workspace_chat', 'active'],
    ])
    expect(result.widgetTokens).toEqual({})

    const row = await rowOf(setup, agent.id)
    expect(row).toMatchObject({
      status: 'active',
      liveVersionId: result.version.id,
      draftRevision: agent.draft.revision + 1,
      draftUpdatedByUserId: setup.builders.bella.id,
    })
    const [frozen] = await versionRows(setup, agent.id)
    expect(frozen?.definition.instructions).toBe('Version one.')
    expect(await auditOf(setup, 'agent.published')).toHaveLength(1)
    expect(await eventsOf(setup, 'agent.published')).toHaveLength(1)
  })

  it('numbers versions per agent and leaves what is live alone while the draft changes', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella', { instructions: 'Version one.' })
    const first = await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      channels: [],
    })
    await edit(setup, agent, (definition) => ({ ...definition, instructions: 'Version two.' }))
    const stillLive = expectData(
      await setup.call('bella', 'GET', `/${agent.id}/versions/${first.version.id}`),
      200,
      agentVersionDetailDtoSchema,
    )
    expect(stillLive.definition.instructions).toBe('Version one.')

    const current = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    const second = await setup.publish('bella', agent.id, {
      baseRevision: current.draft.revision,
      channels: [],
    })
    expect(second.version.version).toBe(2)
    const other = await setup.create('bella', { name: 'Other' })
    const otherFirst = await setup.publish('bella', other.id, {
      baseRevision: other.draft.revision,
      channels: [],
    })
    expect(otherFirst.version.version).toBe(1)
  })

  it('refuses an agent that is not ready, and changes nothing', async () => {
    const setup = await setupAgents()
    const agent = expectData(
      await setup.call('bella', 'POST', '', { name: 'Blank' }),
      201,
      agentDetailDtoSchema,
    )
    const error = expectError(
      await setup.call('bella', 'POST', `/${agent.id}/publish`, {
        baseRevision: agent.draft.revision,
        channels: [],
      }),
      422,
      AGENTS_ERROR_CODES.AGENT_NOT_READY,
    )
    expect(agentReadinessDtoSchema.parse(error.details[0]).canPublish).toBe(false)
    expect(await versionRows(setup, agent.id)).toEqual([])
    expect(await rowOf(setup, agent.id)).toMatchObject({ status: 'draft', liveVersionId: null })
  })

  it('answers a draft that moved with the edit conflict, and an archived agent as read-only', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    expectError(
      await setup.call('bella', 'POST', `/${agent.id}/publish`, {
        baseRevision: agent.draft.revision - 1,
        channels: [],
      }),
      409,
      AGENTS_ERROR_CODES.AGENT_EDIT_CONFLICT,
    )
    await setup.call('bella', 'POST', `/${agent.id}/archive`)
    expectError(
      await setup.call('bella', 'POST', `/${agent.id}/publish`, {
        baseRevision: agent.draft.revision,
        channels: [],
      }),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_EDITABLE,
    )
  })

  it('leaves a paused agent paused when it publishes again', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await setup.publish('bella', agent.id, { baseRevision: agent.draft.revision, channels: [] })
    await setup.call('bella', 'POST', `/${agent.id}/pause`)
    const current = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    const result = await setup.publish('bella', agent.id, {
      baseRevision: current.draft.revision,
      channels: [],
    })
    expect(result.agent.status).toBe('paused')
    expect(result.version.version).toBe(2)
  })

  it('rolls the publish back when a channel cannot be turned on', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    expectError(
      await setup.call('adam', 'POST', `/${agent.id}/publish`, {
        baseRevision: agent.draft.revision,
        channels: [
          {
            type: 'slack',
            connectionId: '0198f2c0-0000-7000-8000-00000000c0de',
            config: { channelIds: [], respondTo: 'mentions' },
          },
        ],
      }),
      404,
      CONNECTIONS_ERROR_CODES.CONNECTION_NOT_FOUND,
    )
    expect(await versionRows(setup, agent.id)).toEqual([])
    expect(await rowOf(setup, agent.id)).toMatchObject({ status: 'draft' })
  })

  it('needs the permission to publish and the right to edit this agent', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const body = { baseRevision: agent.draft.revision, channels: [] }
    expectError(
      await setup.call('uma', 'POST', `/${agent.id}/publish`, body),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await setup.call('ben', 'POST', `/${agent.id}/publish`, body),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
  })
})

describe('rolling back', () => {
  it('points the live version at an earlier one, creates none and leaves the draft', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella', { instructions: 'One.' })
    const first = await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      channels: [],
    })
    await edit(setup, agent, (definition) => ({ ...definition, instructions: 'Two.' }))
    const current = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    await setup.publish('bella', agent.id, { baseRevision: current.draft.revision, channels: [] })

    const rolledBack = expectData(
      await setup.call('bella', 'POST', `/${agent.id}/rollback`, { versionId: first.version.id }),
      200,
      agentDtoSchema,
    )
    expect(rolledBack).toMatchObject({ liveVersion: 1, hasUnpublishedChanges: true })
    expect(await versionRows(setup, agent.id)).toHaveLength(2)
    const after = await rowOf(setup, agent.id)
    expect(after?.liveVersionId).toBe(first.version.id)
    expect(after?.draftDefinition.instructions).toBe('Two.')
    expect(await auditOf(setup, 'agent.rolled_back')).toHaveLength(1)
    expect(await eventsOf(setup, 'agent.published')).toHaveLength(3)

    // the same target again changes nothing
    expectData(
      await setup.call('bella', 'POST', `/${agent.id}/rollback`, { versionId: first.version.id }),
      200,
      agentDtoSchema,
    )
    expect(await auditOf(setup, 'agent.rolled_back')).toHaveLength(1)
  })

  it('refuses an agent that is not published and a version it does not have', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    expectError(
      await setup.call('bella', 'POST', `/${agent.id}/rollback`, { versionId: randomUUID() }),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_PUBLISHED,
    )
    const other = await setup.create('bella', { name: 'Other' })
    const otherVersion = await setup.publish('bella', other.id, {
      baseRevision: other.draft.revision,
      channels: [],
    })
    await setup.publish('bella', agent.id, { baseRevision: agent.draft.revision, channels: [] })
    expectError(
      await setup.call('bella', 'POST', `/${agent.id}/rollback`, {
        versionId: otherVersion.version.id,
      }),
      404,
      AGENTS_ERROR_CODES.AGENT_VERSION_NOT_FOUND,
    )
  })
})

describe('versions and their differences', () => {
  it('lists versions newest first, marks the live one and reads one with its definition', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella', { instructions: 'One.' })
    const first = await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      notes: 'First',
      channels: [],
    })
    await edit(setup, agent, (definition) => ({ ...definition, instructions: 'Two.' }))
    const current = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    const second = await setup.publish('bella', agent.id, {
      baseRevision: current.draft.revision,
      channels: [],
    })
    await setup.call('bella', 'POST', `/${agent.id}/rollback`, { versionId: first.version.id })

    const page = expectPage(
      await setup.call('bella', 'GET', `/${agent.id}/versions`),
      agentVersionDtoSchema,
    )
    expect(page.data.map((version) => [version.version, version.isLive])).toEqual([
      [2, false],
      [1, true],
    ])
    const small = expectPage(
      await setup.call('bella', 'GET', `/${agent.id}/versions`, undefined, { limit: '1' }),
      agentVersionDtoSchema,
    )
    expect(small.data.map((version) => version.version)).toEqual([2])
    const next = expectPage(
      await setup.call('bella', 'GET', `/${agent.id}/versions`, undefined, {
        limit: '1',
        cursor: small.nextCursor ?? '',
      }),
      agentVersionDtoSchema,
    )
    expect(next.data.map((version) => version.version)).toEqual([1])

    const detail = expectData(
      await setup.call('bella', 'GET', `/${agent.id}/versions/${second.version.id}`),
      200,
      agentVersionDetailDtoSchema,
    )
    expect(detail.definition.instructions).toBe('Two.')
    expectError(
      await setup.call('bella', 'GET', `/${agent.id}/versions/${randomUUID()}`),
      404,
      AGENTS_ERROR_CODES.AGENT_VERSION_NOT_FOUND,
    )
  })

  it('diffs a version with the draft, the live version or another version', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella', { instructions: 'One.' })
    const first = await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      channels: [],
    })
    await edit(setup, agent, (definition) => ({
      ...definition,
      instructions: 'Two.',
      tools: [apiTool({ name: 'Look up order' })],
    }))
    const current = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    const second = await setup.publish('bella', agent.id, {
      baseRevision: current.draft.revision,
      channels: [],
    })
    await edit(setup, agent, (definition) => ({ ...definition, tone: 'Formal' }))

    const diff = async (versionId: string, against: string) =>
      expectData(
        await setup.call('bella', 'GET', `/${agent.id}/versions/${versionId}/diff`, undefined, {
          against,
        }),
        200,
        agentDiffDtoSchema,
      ).changes.map((change) => [change.section, change.kind, change.label])

    expect(await diff(second.version.id, 'draft')).toEqual([['instructions', 'changed', 'tone']])
    expect(await diff(first.version.id, second.version.id)).toEqual([
      ['instructions', 'changed', 'instructions'],
      ['tools', 'added', 'Look up order'],
    ])
    expect(await diff(first.version.id, 'live')).toEqual(
      await diff(first.version.id, second.version.id),
    )
    expectError(
      await setup.call(
        'bella',
        'GET',
        `/${agent.id}/versions/${first.version.id}/diff`,
        undefined,
        {
          against: randomUUID(),
        },
      ),
      404,
      AGENTS_ERROR_CODES.AGENT_VERSION_NOT_FOUND,
    )
  })

  it('does not show versions to people who cannot see the agent', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await setup.publish('bella', agent.id, { baseRevision: agent.draft.revision, channels: [] })
    expectError(
      await setup.call('ben', 'GET', `/${agent.id}/versions`),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
  })
})

describe('who can use it', () => {
  it('replaces the audience, names its teams and people, and records the change', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const team = await setup.addTeam('Support', [setup.a.members.uma])
    const access = expectData(
      await setup.call('bella', 'PUT', `/${agent.id}/access`, {
        entries: [
          { subjectType: 'team', teamId: team, level: 'use' },
          { subjectType: 'user', userId: setup.builders.ben.id, level: 'edit' },
        ],
      }),
      200,
      agentAccessDtoSchema,
    )
    expect(
      access.entries.map((entry) => [
        entry.subjectType,
        entry.team?.name ?? entry.user?.name,
        entry.level,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['team', 'Support', 'use'],
        ['user', setup.builders.ben.name, 'edit'],
      ]),
    )
    expect(
      expectData(await setup.call('ben', 'GET', `/${agent.id}/access`), 200, agentAccessDtoSchema)
        .entries,
    ).toHaveLength(2)
    expect(await auditOf(setup, 'agent.access_changed')).toHaveLength(1)

    // the same audience again is not a change
    await setup.call('bella', 'PUT', `/${agent.id}/access`, {
      entries: access.entries.map((entry) =>
        entry.team === null
          ? { subjectType: 'user', userId: entry.user?.id, level: entry.level }
          : { subjectType: 'team', teamId: entry.team.id, level: entry.level },
      ),
    })
    expect(await auditOf(setup, 'agent.access_changed')).toHaveLength(1)

    const card = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    expect(card.sharedWith).toMatchObject({ everyone: false, teamCount: 1, userCount: 1 })
    expect(card.sharedWith.teams.map((entry) => entry.name)).toEqual(['Support'])
  })

  it('refuses people and teams that are not in the organization', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    expectError(
      await setup.call('bella', 'PUT', `/${agent.id}/access`, {
        entries: [{ subjectType: 'user', userId: setup.b.members.bea.id, level: 'use' }],
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await setup.call('bella', 'PUT', `/${agent.id}/access`, {
        entries: [{ subjectType: 'team', teamId: randomUUID(), level: 'use' }],
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('does not let an agent be shared with someone who may not use its model', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const sales = await setup.addTeam('Sales', [setup.a.members.uma])
    const support = await setup.addTeam('Support', [setup.builders.ben])
    await setup.restrictModel([{ subjectType: 'team', teamId: support }])

    const error = expectError(
      await setup.call('bella', 'PUT', `/${agent.id}/access`, {
        entries: [
          { subjectType: 'team', teamId: support, level: 'use' },
          { subjectType: 'team', teamId: sales, level: 'use' },
        ],
      }),
      422,
      AGENTS_ERROR_CODES.AGENT_MODEL_NOT_ALLOWED_FOR_AUDIENCE,
    )
    expect(error.details).toEqual([{ type: 'team', id: sales, name: 'Sales' }])
    expect(
      expectData(await setup.call('bella', 'GET', `/${agent.id}/access`), 200, agentAccessDtoSchema)
        .entries,
    ).toEqual([])

    expectData(
      await setup.call('bella', 'PUT', `/${agent.id}/access`, {
        entries: [{ subjectType: 'team', teamId: support, level: 'use' }],
      }),
      200,
      agentAccessDtoSchema,
    )
    // everyone cannot, because only Support may use the model
    expectError(
      await setup.call('bella', 'PUT', `/${agent.id}/access`, {
        entries: [{ subjectType: 'organization', level: 'use' }],
      }),
      422,
      AGENTS_ERROR_CODES.AGENT_MODEL_NOT_ALLOWED_FOR_AUDIENCE,
    )
  })

  it('blocks publishing to an audience the model does not reach, naming who', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const sales = await setup.addTeam('Sales', [setup.a.members.uma])
    await setup.restrictModel([{ subjectType: 'user', userId: setup.builders.bella.id }])
    const error = expectError(
      await setup.call('bella', 'POST', `/${agent.id}/publish`, {
        baseRevision: agent.draft.revision,
        access: [{ subjectType: 'team', teamId: sales, level: 'use' }],
        channels: [],
      }),
      422,
      AGENTS_ERROR_CODES.AGENT_NOT_READY,
    )
    const readiness = agentReadinessDtoSchema.parse(error.details[0])
    expect(itemOf(readiness, 'model_allowed_for_audience')).toMatchObject({
      passed: false,
      failures: [{ type: 'team', id: sales, name: 'Sales' }],
    })
    expect(await versionRows(setup, agent.id)).toEqual([])
  })

  it('sets the audience in the publish, and a roll back leaves it alone', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const first = await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      access: [{ subjectType: 'organization', level: 'use' }],
      channels: [],
    })
    expect(first.agent.sharedWith.everyone).toBe(true)
    const current = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    await setup.publish('bella', agent.id, {
      baseRevision: current.draft.revision,
      access: [],
      channels: [],
    })
    expect(
      expectData(await setup.call('bella', 'GET', `/${agent.id}/access`), 200, agentAccessDtoSchema)
        .entries,
    ).toEqual([])
    await setup.call('bella', 'POST', `/${agent.id}/rollback`, { versionId: first.version.id })
    expect(
      expectData(await setup.call('bella', 'GET', `/${agent.id}/access`), 200, agentAccessDtoSchema)
        .entries,
    ).toEqual([])
  })
})
