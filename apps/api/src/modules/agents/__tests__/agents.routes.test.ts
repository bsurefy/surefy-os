// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { agents, agentVersions, auditLogs } from '@/database/tables/index.js'
import {
  agentDetailDtoSchema,
  agentDraftDtoSchema,
  agentDtoSchema,
  agentEditConflictDetailsSchema,
  agentImpactDtoSchema,
  AGENTS_ERROR_CODES,
  ERROR_CODES,
  saveAgentDraftDtoSchema,
  usableAgentDtoSchema,
} from '@surefy/contracts'

import { setupAgents, type AgentsSetup } from './agentsTestKit.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'

const auditActions = (setup: AgentsSetup) =>
  setup.db.system('test', async (tx) =>
    (
      await tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.organizationId, setup.a.id))
    ).map((row) => row.action),
  )

const rowOf = (setup: AgentsSetup, agentId: string) =>
  setup.db.system('test', async (tx) => {
    const [row] = await tx.select().from(agents).where(eq(agents.id, agentId))
    return row
  })

/** Shares an agent with a person, as its owner, through the Publish tab's audience. */
const shareWith = async (
  setup: AgentsSetup,
  agentId: string,
  userId: string,
  level: 'use' | 'edit',
) => {
  const response = await setup.call('bella', 'PUT', `/${agentId}/access`, {
    entries: [{ subjectType: 'user', userId, level }],
  })
  expect(response.statusCode, response.body).toBe(200)
}

describe('creating agents', () => {
  it('starts a draft from scratch for a Builder, who owns it', async () => {
    const setup = await setupAgents()
    const created = expectData(
      await setup.call('bella', 'POST', '', { name: 'Support agent', description: 'Orders' }),
      201,
      agentDetailDtoSchema,
    )
    expect(created).toMatchObject({
      name: 'Support agent',
      description: 'Orders',
      status: 'draft',
      liveVersion: null,
      hasUnpublishedChanges: false,
      templateKey: null,
      owner: { id: setup.builders.bella.id },
      model: { modelKey: setup.modelKey },
      canEdit: true,
      canDelete: true,
      channels: [],
    })
    expect(created.draft).toMatchObject({ revision: 1, definition: { instructions: '' } })
    expect(await auditActions(setup)).toContain('agent.created')
  })

  it('uses the model asked for, and refuses one the person may not use', async () => {
    const setup = await setupAgents()
    expectError(
      await setup.call('bella', 'POST', '', { name: 'Agent', modelKey: 'openai/gpt-4.1' }),
      403,
      ERROR_CODES.MODEL_NOT_ALLOWED,
    )
    const created = expectData(
      await setup.call('bella', 'POST', '', { name: 'Agent', modelKey: setup.modelKey }),
      201,
      agentDetailDtoSchema,
    )
    expect(created.draft.definition.model.modelKey).toBe(setup.modelKey)
  })

  it('starts from a template, with its Guard rules and the tools that need no bridge', async () => {
    const setup = await setupAgents()
    const created = expectData(
      await setup.call('bella', 'POST', '', { name: 'Sales', templateKey: 'sales_assistant' }),
      201,
      agentDetailDtoSchema,
    )
    expect(created.templateKey).toBe('sales_assistant')
    const { definition } = created.draft
    expect(definition.tools.map((tool) => tool.kind)).toEqual(['web_search'])
    expect(definition.guard.approvalRules.map((rule) => rule.match.action)).toEqual(['Send email'])
    expect(definition.instructions).toContain('sales assistant')
  })

  it('refuses people who cannot build, and validates the name', async () => {
    const setup = await setupAgents()
    expectError(
      await setup.call('uma', 'POST', '', { name: 'Agent' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await setup.call('bella', 'POST', '', { name: '  ' }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('stops at the plan’s agent limit, and archived agents do not count', async () => {
    const setup = await setupAgents()
    const policy = await request(setup.app, 'PUT', `/api/v1/orgs/${setup.a.id}/access/policy`, {
      headers: setup.sessionOf(setup.a.members.olivia),
      payload: { version: 1, limits: { maxAgents: 1 } },
    })
    expect(policy.statusCode, policy.body).toBe(200)
    const first = await setup.create('bella')
    const error = expectError(
      await setup.call('bella', 'POST', '', { name: 'Second' }),
      403,
      ERROR_CODES.LIMIT_REACHED,
    )
    expect(error.details).toEqual([
      expect.objectContaining({ limit: 'maxAgents', max: 1, used: 1 }),
    ])
    expectError(
      await setup.call('bella', 'POST', `/${first.id}/duplicate`, {}),
      403,
      ERROR_CODES.LIMIT_REACHED,
    )

    expectData(await setup.call('bella', 'POST', `/${first.id}/archive`), 200, agentDtoSchema)
    const second = expectData(
      await setup.call('bella', 'POST', '', { name: 'Second' }),
      201,
      agentDetailDtoSchema,
    )
    expectError(
      await setup.call('bella', 'POST', `/${first.id}/restore`),
      403,
      ERROR_CODES.LIMIT_REACHED,
    )
    expectNoContent(await setup.call('bella', 'DELETE', `/${second.id}`))
    expect(
      expectData(await setup.call('bella', 'POST', `/${first.id}/restore`), 200, agentDtoSchema)
        .status,
    ).toBe('draft')
  })
})

describe('seeing agents', () => {
  it('lists the agents a Builder owns or has been given, and all of them for an Admin', async () => {
    const setup = await setupAgents()
    const bellas = await setup.create('bella', { name: 'Bella’s agent' })
    const bens = await setup.create('ben', { name: 'Ben’s agent' })

    const forBella = expectPage(await setup.call('bella', 'GET', ''), agentDtoSchema)
    expect(forBella.data.map((agent) => agent.id)).toEqual([bellas.id])
    const forAdam = expectPage(await setup.call('adam', 'GET', ''), agentDtoSchema)
    expect(forAdam.data.map((agent) => agent.id)).toHaveLength(2)
    expect(forAdam.data.map((agent) => agent.id)).toEqual(
      expect.arrayContaining([bellas.id, bens.id]),
    )

    expectError(
      await setup.call('bella', 'GET', `/${bens.id}`),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
    expectError(await setup.call('uma', 'GET', ''), 403, ERROR_CODES.ACCESS_FORBIDDEN)
  })

  it('shows an agent shared for use read-only, and one shared for editing as editable', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const { ben } = setup.builders
    await shareWith(setup, agent.id, ben.id, 'use')
    const seen = expectData(
      await setup.call('ben', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    expect(seen).toMatchObject({ canEdit: false, canDelete: false, sharedWith: { userCount: 1 } })

    await shareWith(setup, agent.id, ben.id, 'edit')
    const editable = expectData(
      await setup.call('ben', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    expect(editable).toMatchObject({ canEdit: true, canDelete: false })
  })

  it('filters by name, owner and status, and keeps archived agents out unless asked', async () => {
    const setup = await setupAgents()
    const orders = await setup.create('bella', { name: 'Order helper' })
    const refunds = await setup.create('bella', { name: 'Refund helper' })
    await setup.create('ben', { name: 'Invoice helper' })
    await setup.call('bella', 'POST', `/${refunds.id}/archive`)

    const names = async (query: Record<string, string>) =>
      expectPage(await setup.call('adam', 'GET', '', undefined, query), agentDtoSchema).data.map(
        (agent) => agent.name,
      )
    expect(await names({})).toEqual(['Invoice helper', 'Order helper'])
    expect(await names({ q: 'order' })).toEqual(['Order helper'])
    expect(await names({ status: 'archived' })).toEqual(['Refund helper'])
    expect(await names({ ownerId: setup.builders.ben.id })).toEqual(['Invoice helper'])
    const mine = expectPage(
      await setup.call('bella', 'GET', '', undefined, { mine: 'true' }),
      agentDtoSchema,
    )
    expect(mine.data.map((agent) => agent.id)).toEqual([orders.id])
  })

  it('pages the list with a cursor', async () => {
    const setup = await setupAgents()
    for (const name of ['A', 'B', 'C']) await setup.create('bella', { name })
    const first = expectPage(
      await setup.call('bella', 'GET', '', undefined, { limit: '2', sort: 'name' }),
      agentDtoSchema,
    )
    expect(first.data.map((agent) => agent.name)).toEqual(['A', 'B'])
    expect(first.nextCursor).not.toBeNull()
    const second = expectPage(
      await setup.call('bella', 'GET', '', undefined, {
        limit: '2',
        sort: 'name',
        cursor: first.nextCursor ?? '',
      }),
      agentDtoSchema,
    )
    expect(second.data.map((agent) => agent.name)).toEqual(['C'])
    expect(second.nextCursor).toBeNull()
  })

  it('lists only published, running agents the person may talk to', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella', { name: 'Support' })
    await setup.create('bella', { name: 'Unpublished' })
    const usable = async () =>
      expectPage(await setup.call('uma', 'GET', '/usable'), usableAgentDtoSchema).data

    expect(await usable()).toEqual([])
    await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      access: [{ subjectType: 'organization', level: 'use' }],
      channels: [],
    })
    const [listed] = await usable()
    expect(listed).toMatchObject({ id: agent.id, name: 'Support' })
    expect(listed?.model?.modelKey).toBe(setup.modelKey)
    await setup.call('bella', 'POST', `/${agent.id}/pause`)
    expect(await usable()).toEqual([])
  })
})

describe('the draft', () => {
  it('autosaves with a new revision and never touches what is live', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const saved = expectData(
      await setup.call('bella', 'PUT', `/${agent.id}/draft`, {
        baseRevision: agent.draft.revision,
        definition: { ...agent.draft.definition, instructions: 'Be brief.' },
      }),
      200,
      saveAgentDraftDtoSchema,
    )
    expect(saved).toMatchObject({
      revision: agent.draft.revision + 1,
      hasUnpublishedChanges: false,
    })

    const draft = expectData(
      await setup.call('bella', 'GET', `/${agent.id}/draft`),
      200,
      agentDraftDtoSchema,
    )
    expect(draft).toMatchObject({
      revision: saved.revision,
      definition: { instructions: 'Be brief.' },
      updatedBy: { id: setup.builders.bella.id },
    })
  })

  it('flags unpublished changes once something is live', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await setup.publish('bella', agent.id, { baseRevision: agent.draft.revision, channels: [] })
    const current = expectData(
      await setup.call('bella', 'GET', `/${agent.id}`),
      200,
      agentDetailDtoSchema,
    )
    expect(current.hasUnpublishedChanges).toBe(false)
    const saved = expectData(
      await setup.call('bella', 'PUT', `/${agent.id}/draft`, {
        baseRevision: current.draft.revision,
        definition: { ...current.draft.definition, instructions: 'Changed after publishing.' },
      }),
      200,
      saveAgentDraftDtoSchema,
    )
    expect(saved.hasUnpublishedChanges).toBe(true)
  })

  it('answers a stale revision with the edit conflict and saves nothing', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const stale = agent.draft.revision - 1
    const error = expectError(
      await setup.call('bella', 'PUT', `/${agent.id}/draft`, {
        baseRevision: stale,
        definition: { ...agent.draft.definition, instructions: 'Mine' },
      }),
      409,
      AGENTS_ERROR_CODES.AGENT_EDIT_CONFLICT,
    )
    const details = agentEditConflictDetailsSchema.parse(error.details[0])
    expect(details).toMatchObject({
      currentRevision: agent.draft.revision,
      updatedBy: { id: setup.builders.bella.id },
      publishedVersion: null,
    })
    expect((await rowOf(setup, agent.id))?.draftDefinition.instructions).toBe(
      agent.draft.definition.instructions,
    )
  })

  it('names the version when the draft moved because someone published', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await shareWith(setup, agent.id, setup.builders.ben.id, 'edit')
    const loadedByBen = agent.draft.revision
    const published = await setup.publish('bella', agent.id, {
      baseRevision: agent.draft.revision,
      channels: [],
    })
    const error = expectError(
      await setup.call('ben', 'PUT', `/${agent.id}/draft`, {
        baseRevision: loadedByBen,
        definition: { ...agent.draft.definition, instructions: 'Ben’s version' },
      }),
      409,
      AGENTS_ERROR_CODES.AGENT_EDIT_CONFLICT,
    )
    const details = agentEditConflictDetailsSchema.parse(error.details[0])
    expect(details).toMatchObject({
      publishedVersion: published.version.version,
      updatedBy: { id: setup.builders.bella.id },
    })
    // "Keep mine": the same draft again on the new revision
    expectData(
      await setup.call('ben', 'PUT', `/${agent.id}/draft`, {
        baseRevision: details.currentRevision,
        definition: { ...agent.draft.definition, instructions: 'Ben’s version' },
      }),
      200,
      saveAgentDraftDtoSchema,
    )
  })

  it('lets nobody but an editor save, and nobody save an archived agent', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const body = { baseRevision: agent.draft.revision, definition: agent.draft.definition }
    expectError(
      await setup.call('ben', 'PUT', `/${agent.id}/draft`, body),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
    await shareWith(setup, agent.id, setup.builders.ben.id, 'use')
    expectError(
      await setup.call('ben', 'PUT', `/${agent.id}/draft`, body),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    await setup.call('bella', 'POST', `/${agent.id}/archive`)
    expectError(
      await setup.call('bella', 'PUT', `/${agent.id}/draft`, body),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_EDITABLE,
    )
  })

  it('rejects a definition that is not valid', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    expectError(
      await setup.call('bella', 'PUT', `/${agent.id}/draft`, {
        baseRevision: agent.draft.revision,
        definition: { ...agent.draft.definition, model: { modelKey: '' } },
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })
})

describe('name and description', () => {
  it('saves them directly, and records only real changes', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const updated = expectData(
      await setup.call('bella', 'PATCH', `/${agent.id}`, { name: 'Renamed', description: null }),
      200,
      agentDtoSchema,
    )
    expect(updated).toMatchObject({ name: 'Renamed', description: null })
    await setup.call('bella', 'PATCH', `/${agent.id}`, { name: 'Renamed' })
    expect((await auditActions(setup)).filter((action) => action === 'agent.updated')).toHaveLength(
      1,
    )
    expectError(
      await setup.call('bella', 'PATCH', `/${agent.id}`, {}),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
  })

  it('makes a draft copy owned by whoever copies it', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella', { name: 'Original', instructions: 'Copy me.' })
    await shareWith(setup, agent.id, setup.builders.ben.id, 'use')
    const copy = expectData(
      await setup.call('ben', 'POST', `/${agent.id}/duplicate`, {}),
      201,
      agentDetailDtoSchema,
    )
    expect(copy).toMatchObject({
      name: 'Original (copy)',
      status: 'draft',
      owner: { id: setup.builders.ben.id },
      liveVersion: null,
      sharedWith: { everyone: false, teamCount: 0, userCount: 0 },
    })
    expect(copy.draft.definition.instructions).toBe('Copy me.')
  })
})

describe('pausing, archiving and restoring', () => {
  it('walks the state machine', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const act = async (action: string) => setup.call('bella', 'POST', `/${agent.id}/${action}`)

    expectError(await act('pause'), 409, AGENTS_ERROR_CODES.AGENT_NOT_PUBLISHED)
    expectError(await act('resume'), 409, AGENTS_ERROR_CODES.AGENT_STATE_INVALID)
    await setup.publish('bella', agent.id, { baseRevision: agent.draft.revision, channels: [] })

    const paused = expectData(await act('pause'), 200, agentDtoSchema)
    expect(paused.status).toBe('paused')
    expect(paused.pausedAt).not.toBeNull()
    expectError(await act('pause'), 409, AGENTS_ERROR_CODES.AGENT_STATE_INVALID)
    expect(expectData(await act('resume'), 200, agentDtoSchema)).toMatchObject({
      status: 'active',
      pausedAt: null,
    })

    const archived = expectData(await act('archive'), 200, agentDtoSchema)
    expect(archived.status).toBe('archived')
    expect(archived.archivedAt).not.toBeNull()
    expectError(await act('archive'), 409, AGENTS_ERROR_CODES.AGENT_STATE_INVALID)
    expectError(
      await setup.call('bella', 'PATCH', `/${agent.id}`, { name: 'Nope' }),
      409,
      AGENTS_ERROR_CODES.AGENT_NOT_EDITABLE,
    )
    // an agent that was ever published comes back paused
    expect(expectData(await act('restore'), 200, agentDtoSchema)).toMatchObject({
      status: 'paused',
      archivedAt: null,
    })
    expect(await auditActions(setup)).toEqual(
      expect.arrayContaining(['agent.paused', 'agent.resumed', 'agent.archived', 'agent.restored']),
    )
  })

  it('restores an agent that was never published as a draft', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await setup.call('bella', 'POST', `/${agent.id}/archive`)
    expect(
      expectData(await setup.call('bella', 'POST', `/${agent.id}/restore`), 200, agentDtoSchema)
        .status,
    ).toBe('draft')
  })
})

describe('deleting', () => {
  it('removes a never-published agent outright', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    const impact = expectData(
      await setup.call('bella', 'GET', `/${agent.id}/impact`, undefined, { action: 'delete' }),
      200,
      agentImpactDtoSchema,
    )
    expect(impact).toMatchObject({
      deleteRequiresConfirmation: false,
      runCount: 0,
      activeChannels: [],
    })

    expectNoContent(await setup.call('bella', 'DELETE', `/${agent.id}`))
    expect(await rowOf(setup, agent.id)).toBeUndefined()
    expect(await auditActions(setup)).toContain('agent.deleted')
  })

  it('turns a published agent into a tombstone that needs its name and a reason', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella', { name: 'Support' })
    await shareWith(setup, agent.id, setup.builders.ben.id, 'edit')
    await setup.publish('bella', agent.id, { baseRevision: agent.draft.revision, channels: [] })
    const impact = expectData(
      await setup.call('bella', 'GET', `/${agent.id}/impact`, undefined, { action: 'delete' }),
      200,
      agentImpactDtoSchema,
    )
    expect(impact.deleteRequiresConfirmation).toBe(true)

    expectError(
      await setup.call('bella', 'DELETE', `/${agent.id}`),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectError(
      await setup.call('bella', 'DELETE', `/${agent.id}`, undefined, {
        confirmName: 'support',
        reason: 'Replaced',
      }),
      422,
      ERROR_CODES.VALIDATION_FAILED,
    )
    expectNoContent(
      await setup.call('bella', 'DELETE', `/${agent.id}`, undefined, {
        confirmName: 'Support',
        reason: 'Replaced by the new agent',
      }),
    )

    const row = await rowOf(setup, agent.id)
    expect(row).toMatchObject({ status: 'archived' })
    expect(row?.deletedAt).toBeInstanceOf(Date)
    // hidden everywhere, with the audience gone, while the versions stay for the runs and the audit
    expectError(
      await setup.call('bella', 'GET', `/${agent.id}`),
      404,
      AGENTS_ERROR_CODES.AGENT_NOT_FOUND,
    )
    expect(expectPage(await setup.call('adam', 'GET', ''), agentDtoSchema).data).toEqual([])
    const versions = await setup.db.system('test', (tx) =>
      tx.select().from(agentVersions).where(eq(agentVersions.agentId, agent.id)),
    )
    expect(versions).toHaveLength(1)
    const [entry] = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, 'agent.deleted')),
        ),
    )
    expect(entry).toMatchObject({ reason: 'Replaced by the new agent', targetId: agent.id })
  })

  it('lets owners and Admins delete, and nobody else', async () => {
    const setup = await setupAgents()
    const agent = await setup.create('bella')
    await shareWith(setup, agent.id, setup.builders.ben.id, 'edit')
    expectError(
      await setup.call('ben', 'DELETE', `/${agent.id}`),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await setup.call('uma', 'DELETE', `/${agent.id}`),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectNoContent(await setup.call('adam', 'DELETE', `/${agent.id}`))
  })
})
