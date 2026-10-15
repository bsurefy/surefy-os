// SPDX-License-Identifier: AGPL-3.0-only
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { prompts } from '@/database/tables/index.js'
import { auditLogs } from '@/database/tables/partitioned/audit.tables.js'
import {
  ERROR_CODES,
  PROMPT_RESTORE_WINDOW_DAYS,
  promptDtoSchema,
  teamDtoSchema,
} from '@surefy/contracts'

import { as, orgUrl } from './chatsTestKit.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import {
  expectData,
  expectError,
  expectNoContent,
  expectPage,
  request,
} from '../../../../test/helpers/request.js'

import type { Who } from './chatsTestKit.js'

const DAY_MS = 86_400_000

const url = (setup: TwoOrgSetup, path = '') => orgUrl(setup, `/prompts${path}`)

const create = (setup: TwoOrgSetup, payload: Record<string, unknown>, who: Who = 'uma') =>
  request(setup.app, 'POST', url(setup), { headers: as(setup, who), payload })

const list = async (setup: TwoOrgSetup, who: Who, query: Record<string, string> = {}) =>
  expectPage(
    await request(setup.app, 'GET', url(setup), { headers: as(setup, who), query }),
    promptDtoSchema,
  ).data

describe('prompt library', () => {
  it('keeps personal prompts to their owner and parses their variables', async () => {
    const setup = await setupTwoOrgs()
    const prompt = expectData(
      await create(setup, {
        title: 'Renewal offer',
        body: 'Write a renewal offer for {customer} by {date}; mention {customer} once. Not {1st}.',
      }),
      201,
      promptDtoSchema,
    )
    expect(prompt).toMatchObject({
      visibility: 'personal',
      variables: ['customer', 'date'],
      teams: [],
      canEdit: true,
      owner: { id: setup.a.members.uma.id },
    })
    expect((await list(setup, 'uma')).map((row) => row.id)).toEqual([prompt.id])
    expect(await list(setup, 'adam')).toEqual([])
    expectError(
      await request(setup.app, 'GET', url(setup, `/${prompt.id}`), { headers: as(setup, 'adam') }),
      404,
      ERROR_CODES.PROMPT_NOT_FOUND,
    )

    const edited = expectData(
      await request(setup.app, 'PATCH', url(setup, `/${prompt.id}`), {
        headers: as(setup),
        payload: { body: 'Summarize {ticket}' },
      }),
      200,
      promptDtoSchema,
    )
    expect(edited.variables).toEqual(['ticket'])
    expect((await list(setup, 'uma', { q: 'ticket' })).map((row) => row.id)).toEqual([prompt.id])
    expect(await list(setup, 'uma', { q: 'nothing like it' })).toEqual([])

    // personal prompts are not audited
    const audited = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.targetId, prompt.id)),
    )
    expect(audited).toEqual([])
  })

  it('lets Builders and above share prompts with the organization or with teams', async () => {
    const setup = await setupTwoOrgs()
    // a plain user keeps prompts personal
    expectError(
      await create(setup, { title: 'Shared', body: 'Hello', visibility: 'shared' }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    const team = expectData(
      await request(setup.app, 'POST', orgUrl(setup, '/teams'), {
        headers: as(setup, 'adam'),
        payload: { name: 'Support', memberUserIds: [setup.a.members.uma.id] },
      }),
      201,
      teamDtoSchema,
    )
    const everyone = expectData(
      await create(setup, { title: 'Tone guide', body: 'Be kind', visibility: 'shared' }, 'adam'),
      201,
      promptDtoSchema,
    )
    const support = expectData(
      await create(
        setup,
        {
          title: 'Escalation',
          body: 'Escalate {ticket}',
          visibility: 'shared',
          teamIds: [team.id],
        },
        'adam',
      ),
      201,
      promptDtoSchema,
    )
    expect(support.teams).toEqual([{ id: team.id, name: 'Support' }])
    expectError(
      await create(
        setup,
        {
          title: 'Nope',
          body: 'x',
          visibility: 'shared',
          teamIds: ['0198a000-0000-7000-8000-00000000beef'],
        },
        'adam',
      ),
      422,
      ERROR_CODES.PROMPT_TEAM_NOT_FOUND,
    )

    // Uma is in Support: she sees both, edits neither; Olivia (not in Support) sees the first
    const seen = await list(setup, 'uma', { sort: 'title' })
    expect(seen.map((row) => [row.title, row.canEdit])).toEqual([
      ['Escalation', false],
      ['Tone guide', false],
    ])
    expect((await list(setup, 'olivia')).map((row) => row.id)).toEqual([everyone.id])
    expectError(
      await request(setup.app, 'PATCH', url(setup, `/${support.id}`), {
        headers: as(setup),
        payload: { title: 'Mine' },
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
    // the owner of the organization manages shared prompts she can see
    expectData(
      await request(setup.app, 'PATCH', url(setup, `/${everyone.id}`), {
        headers: as(setup, 'olivia'),
        payload: { title: 'Tone of voice', teamIds: [team.id] },
      }),
      200,
      promptDtoSchema,
    )
    // limited to Support now: Olivia only sees it if she is in it (she is not)
    expect(await list(setup, 'olivia')).toEqual([])

    // switching to personal takes the teams away and makes the switcher its owner
    const personal = expectData(
      await request(setup.app, 'PATCH', url(setup, `/${support.id}`), {
        headers: as(setup, 'adam'),
        payload: { visibility: 'personal' },
      }),
      200,
      promptDtoSchema,
    )
    expect(personal).toMatchObject({
      visibility: 'personal',
      teams: [],
      owner: { id: setup.a.members.adam.id },
    })
    expect((await list(setup, 'uma')).map((row) => row.id)).toEqual([everyone.id])

    const actions = await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.targetType, 'prompt'))
        .orderBy(auditLogs.createdAt),
    )
    expect(actions.map((row) => row.action)).toEqual([
      'prompt.created',
      'prompt.created',
      'prompt.updated',
      'prompt.updated',
    ])
  })

  it('deletes into Recently deleted and restores within 30 days', async () => {
    const setup = await setupTwoOrgs()
    const prompt = expectData(
      await create(setup, { title: 'Weekly summary', body: 'Summarize the week' }),
      201,
      promptDtoSchema,
    )
    expectNoContent(
      await request(setup.app, 'DELETE', url(setup, `/${prompt.id}`), { headers: as(setup) }),
    )
    expect(await list(setup, 'uma')).toEqual([])
    const [deleted] = await list(setup, 'uma', { state: 'deleted' })
    expect(deleted?.id).toBe(prompt.id)
    const left = Date.parse(deleted?.purgeAt ?? '') - Date.parse(deleted?.deletedAt ?? '')
    expect(left).toBe(PROMPT_RESTORE_WINDOW_DAYS * DAY_MS)
    // nobody else restores a personal prompt
    expectError(
      await request(setup.app, 'POST', url(setup, `/${prompt.id}/restore`), {
        headers: as(setup, 'olivia'),
      }),
      404,
      ERROR_CODES.PROMPT_NOT_FOUND,
    )
    const restored = expectData(
      await request(setup.app, 'POST', url(setup, `/${prompt.id}/restore`), { headers: as(setup) }),
      200,
      promptDtoSchema,
    )
    expect(restored.deletedAt).toBeNull()

    // past the window it is gone for good, even before the purge runs
    expectNoContent(
      await request(setup.app, 'DELETE', url(setup, `/${prompt.id}`), { headers: as(setup) }),
    )
    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .update(prompts)
        .set({ deletedAt: sql`now() - interval '31 days'` })
        .where(eq(prompts.id, prompt.id)),
    )
    expect(await list(setup, 'uma', { state: 'deleted' })).toEqual([])
    expectError(
      await request(setup.app, 'POST', url(setup, `/${prompt.id}/restore`), { headers: as(setup) }),
      404,
      ERROR_CODES.PROMPT_NOT_FOUND,
    )
  })

  it('restores a shared prompt without an owner for Builders and above', async () => {
    const setup = await setupTwoOrgs()
    const shared = expectData(
      await create(
        setup,
        { title: 'Policy', body: 'Quote the policy', visibility: 'shared' },
        'adam',
      ),
      201,
      promptDtoSchema,
    )
    expectNoContent(
      await request(setup.app, 'DELETE', url(setup, `/${shared.id}`), {
        headers: as(setup, 'adam'),
      }),
    )
    // the owner was erased
    await setup.db.tenant(setup.a.id, (tx) =>
      tx.update(prompts).set({ ownerUserId: null }).where(eq(prompts.id, shared.id)),
    )
    expect(await list(setup, 'uma', { state: 'deleted' })).toEqual([])
    expect((await list(setup, 'olivia', { state: 'deleted' })).map((row) => row.id)).toEqual([
      shared.id,
    ])
    expectData(
      await request(setup.app, 'POST', url(setup, `/${shared.id}/restore`), {
        headers: as(setup, 'olivia'),
      }),
      200,
      promptDtoSchema,
    )
    const actions = await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.targetId, shared.id)),
    )
    expect(actions.map((row) => row.action).sort((a, b) => a.localeCompare(b))).toEqual([
      'prompt.created',
      'prompt.deleted',
      'prompt.restored',
    ])
  })
})
