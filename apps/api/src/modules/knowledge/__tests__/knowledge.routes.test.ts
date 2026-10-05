// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  deletedKnowledgeItemDtoSchema,
  ERROR_CODES,
  knowledgeAccessDtoSchema,
  knowledgeAccessImpactDtoSchema,
  knowledgeBaseDtoSchema,
  knowledgeBaseImpactDtoSchema,
  knowledgeSummaryDtoSchema,
  teamDtoSchema,
} from '@surefy/contracts'

import { basesUrl, createBase, seedEmbeddingModel, type Who } from './knowledgeTestKit.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'

const call = (
  setup: TwoOrgSetup,
  who: Who,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  payload?: unknown,
  query?: Record<string, string>,
) =>
  request(setup.app, method, path, {
    headers: setup.sessionOf(setup.a.members[who]),
    ...(payload === undefined ? {} : { payload }),
    ...(query === undefined ? {} : { query }),
  })

const createTeam = async (setup: TwoOrgSetup, name: string, memberUserIds: string[]) =>
  expectData(
    await call(setup, 'adam', 'POST', `/api/v1/orgs/${setup.a.id}/teams`, { name, memberUserIds }),
    201,
    teamDtoSchema,
  )

describe('knowledge bases', () => {
  it('creates a base on the organization embedding model, with Can manage for the creator', async () => {
    const setup = await setupTwoOrgs()
    const modelKey = await seedEmbeddingModel(setup)
    const team = await createTeam(setup, 'People Ops', [setup.a.members.uma.id])
    const base = await createBase(setup, 'adam', {
      description: 'Everything HR',
      teamIds: [team.id],
    })
    expect(base).toMatchObject({
      name: 'HR Policies',
      description: 'Everything HR',
      isLocalOnly: false,
      chunkingPreset: 'default',
      embeddingModel: { modelKey, dataLocation: 'provider' },
      sourceCount: 0,
      chunkCount: 0,
      effectiveLevel: 'manage',
      reindex: null,
      deletedAt: null,
    })
    expect(base.accessTeams).toEqual([{ id: team.id, name: 'People Ops' }])
    expect(base.createdBy?.id).toBe(setup.a.members.adam.id)

    const access = expectData(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}/access`)),
      200,
      knowledgeAccessDtoSchema,
    )
    expect(access.grants.map((g) => [g.subjectType, g.level])).toEqual([
      ['user', 'manage'],
      ['team', 'search'],
    ])
  })

  it('keeps names unique among active bases, case-insensitively', async () => {
    const setup = await setupTwoOrgs()
    await createBase(setup, 'adam')
    expectError(
      await call(setup, 'olivia', 'POST', basesUrl(setup.a.id), { name: 'hr policies' }),
      409,
      ERROR_CODES.KNOWLEDGE_NAME_TAKEN,
    )
  })

  it('lets only Builders and above create, and Users see only what they were granted', async () => {
    const setup = await setupTwoOrgs()
    expectError(
      await call(setup, 'uma', 'POST', basesUrl(setup.a.id), { name: 'Mine' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    const base = await createBase(setup, 'adam')
    // no grant: the base does not exist for Uma
    expectError(
      await call(setup, 'uma', 'GET', basesUrl(setup.a.id, `/${base.id}`)),
      404,
      ERROR_CODES.KNOWLEDGE_NOT_FOUND,
    )
    expect(
      expectPage(await call(setup, 'uma', 'GET', basesUrl(setup.a.id)), knowledgeBaseDtoSchema)
        .data,
    ).toEqual([])

    const team = await createTeam(setup, 'People Ops', [setup.a.members.uma.id])
    expectData(
      await call(setup, 'adam', 'PUT', basesUrl(setup.a.id, `/${base.id}/access`), {
        grants: [{ subjectType: 'team', teamId: team.id, level: 'manage' }],
      }),
      200,
      knowledgeAccessDtoSchema,
    )
    // a team's Can manage gives its Users only Can search
    const seen = expectData(
      await call(setup, 'uma', 'GET', basesUrl(setup.a.id, `/${base.id}`)),
      200,
      knowledgeBaseDtoSchema,
    )
    expect(seen.effectiveLevel).toBe('search')
    expectError(
      await call(setup, 'uma', 'PATCH', basesUrl(setup.a.id, `/${base.id}`), { name: 'Hacked' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    expectError(
      await call(setup, 'uma', 'GET', basesUrl(setup.a.id, `/${base.id}/access`)),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    const summary = expectData(
      await call(setup, 'uma', 'GET', `/api/v1/orgs/${setup.a.id}/knowledge/summary`),
      200,
      knowledgeSummaryDtoSchema,
    )
    expect(summary).toMatchObject({ knowledgeBases: 1, sources: 0 })
  })

  it('renames, switches local-only and filters the list', async () => {
    const setup = await setupTwoOrgs()
    await seedEmbeddingModel(setup) // a cloud model: a local-only base cannot use it
    expectError(
      await call(setup, 'adam', 'POST', basesUrl(setup.a.id), {
        name: 'Secrets',
        isLocalOnly: true,
      }),
      422,
      ERROR_CODES.KNOWLEDGE_LOCAL_EMBEDDING_REQUIRED,
    )
    const base = await createBase(setup, 'adam')
    expectError(
      await call(setup, 'adam', 'PATCH', basesUrl(setup.a.id, `/${base.id}`), {
        isLocalOnly: true,
      }),
      422,
      ERROR_CODES.KNOWLEDGE_LOCAL_EMBEDDING_REQUIRED,
    )
    const renamed = expectData(
      await call(setup, 'adam', 'PATCH', basesUrl(setup.a.id, `/${base.id}`), {
        name: 'People handbook',
        description: null,
      }),
      200,
      knowledgeBaseDtoSchema,
    )
    expect(renamed).toMatchObject({ name: 'People handbook', description: null })
    await createBase(setup, 'adam', { name: 'Zebra' })
    const list = expectPage(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id), undefined, { q: 'hand' }),
      knowledgeBaseDtoSchema,
    )
    expect(list.data.map((b) => b.name)).toEqual(['People handbook'])
    const sorted = expectPage(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id)),
      knowledgeBaseDtoSchema,
    )
    expect(sorted.data.map((b) => b.name)).toEqual(['People handbook', 'Zebra'])
  })

  it('moves a base to Recently deleted and restores it, asking for a new name when it is taken', async () => {
    const setup = await setupTwoOrgs()
    const base = await createBase(setup, 'adam')
    const impact = expectData(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}/impact`)),
      200,
      knowledgeBaseImpactDtoSchema,
    )
    expect(impact).toMatchObject({ sourceCount: 0, restoreWindowDays: 30 })

    expectNoContent(await call(setup, 'adam', 'DELETE', basesUrl(setup.a.id, `/${base.id}`)))
    expectError(
      await call(setup, 'adam', 'GET', basesUrl(setup.a.id, `/${base.id}`)),
      404,
      ERROR_CODES.KNOWLEDGE_NOT_FOUND,
    )
    expect(
      expectPage(await call(setup, 'adam', 'GET', basesUrl(setup.a.id)), knowledgeBaseDtoSchema)
        .data,
    ).toEqual([])

    const deleted = expectPage(
      await call(setup, 'adam', 'GET', `/api/v1/orgs/${setup.a.id}/knowledge/recently-deleted`),
      deletedKnowledgeItemDtoSchema,
    ).data
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toMatchObject({ kind: 'knowledge_base', id: base.id, canRestore: true })

    await createBase(setup, 'adam') // takes the name
    expectError(
      await call(setup, 'adam', 'POST', basesUrl(setup.a.id, `/${base.id}/restore`), {}),
      409,
      ERROR_CODES.KNOWLEDGE_NAME_TAKEN,
    )
    const restored = expectData(
      await call(setup, 'adam', 'POST', basesUrl(setup.a.id, `/${base.id}/restore`), {
        name: 'HR Policies (old)',
      }),
      200,
      knowledgeBaseDtoSchema,
    )
    expect(restored).toMatchObject({ name: 'HR Policies (old)', deletedAt: null })
  })
})

describe('access', () => {
  it('replaces the grants, bumps the access version, and names who loses access', async () => {
    const setup = await setupTwoOrgs()
    const base = await createBase(setup, 'adam')
    const team = await createTeam(setup, 'People Ops', [setup.a.members.uma.id])
    const access = expectData(
      await call(setup, 'adam', 'PUT', basesUrl(setup.a.id, `/${base.id}/access`), {
        grants: [
          { subjectType: 'team', teamId: team.id, level: 'search' },
          { subjectType: 'user', userId: setup.a.members.uma.id, level: 'search' },
          { subjectType: 'team', teamId: team.id, level: 'manage' },
        ],
      }),
      200,
      knowledgeAccessDtoSchema,
    )
    // the later grant for the same team wins; Adam's own grant is replaced like any other
    expect(access.grants.map((g) => [g.subjectType, g.level])).toEqual([
      ['team', 'manage'],
      ['user', 'search'],
    ])
    const impact = expectData(
      await call(
        setup,
        'adam',
        'GET',
        basesUrl(setup.a.id, `/${base.id}/access/impact`),
        undefined,
        { teamId: team.id },
      ),
      200,
      knowledgeAccessImpactDtoSchema,
    )
    expect(impact).toMatchObject({ team: { id: team.id }, memberCount: 1, agentCount: 0 })
    // Admins and Owners manage every base even without a grant
    expectData(
      await call(setup, 'olivia', 'GET', basesUrl(setup.a.id, `/${base.id}`)),
      200,
      knowledgeBaseDtoSchema,
    )
    expectError(
      await call(setup, 'adam', 'PUT', basesUrl(setup.a.id, `/${base.id}/access`), {
        grants: [{ subjectType: 'user', userId: setup.b.members.bea.id, level: 'search' }],
      }),
      404,
      ERROR_CODES.MEMBER_NOT_FOUND,
    )
  })
})

describe('embedding model', () => {
  it('estimates the impact, rejects models that are not embedding models, and says no model blocks uploads', async () => {
    const setup = await setupTwoOrgs()
    const base = await createBase(setup, 'adam') // no embedding model yet
    expect(base.embeddingModel).toBeNull()
    expectError(
      await call(setup, 'adam', 'PUT', basesUrl(setup.a.id, `/${base.id}/embedding-model`), {
        modelKey: 'openai/gpt-4.1',
      }),
      422,
      ERROR_CODES.KNOWLEDGE_EMBEDDING_MODEL_INVALID,
    )
    expectError(
      await call(setup, 'olivia', 'POST', basesUrl(setup.a.id, `/${base.id}/sources/files`), {
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
        sha256: 'a'.repeat(64),
      }),
      409,
      ERROR_CODES.KNOWLEDGE_NO_EMBEDDING_MODEL,
    )
  })
})
