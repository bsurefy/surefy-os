// SPDX-License-Identifier: AGPL-3.0-only
import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { auditLogs } from '@/database/tables/index.js'
import {
  auditEntryDtoSchema,
  auditIntegrityStatusDtoSchema,
  ERROR_CODES,
  teamDtoSchema,
} from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'

const auditUrl = (orgId: string, path: string) => `/api/v1/orgs/${orgId}/audit${path}`

const createTeam = async (setup: TwoOrgSetup, name: string) =>
  expectData(
    await request(setup.app, 'POST', `/api/v1/orgs/${setup.a.id}/teams`, {
      headers: setup.sessionOf(setup.a.members.adam),
      payload: { name },
    }),
    201,
    teamDtoSchema,
  )

describe('the audit log', () => {
  it('records a change in its transaction and lists it with names resolved at read time', async () => {
    const setup = await setupTwoOrgs()
    const team = await createTeam(setup, 'Research')
    const headers = setup.sessionOf(setup.a.members.adam)
    const page = expectPage(
      await request(setup.app, 'GET', auditUrl(setup.a.id, '/entries'), {
        headers,
        query: { action: 'team.created' },
      }),
      auditEntryDtoSchema,
    )
    expect(page.data).toHaveLength(1)
    const [entry] = page.data
    expect(entry).toMatchObject({
      actor: { type: 'user', userId: setup.a.members.adam.id, name: 'adam' },
      via: 'user',
      action: 'team.created',
      targetType: 'team',
      targetId: team.id,
      targetLabel: 'Research',
      outcome: 'success',
      metadata: { version: 1, counts: { members: 0 } },
      integrity: { chainSeq: null, chainHash: null, sealedAt: null },
    })
    expect(entry?.requestId).not.toBeNull()
    const one = expectData(
      await request(setup.app, 'GET', auditUrl(setup.a.id, `/entries/${entry?.id ?? ''}`), {
        headers,
      }),
      200,
      auditEntryDtoSchema,
    )
    expect(one.id).toBe(entry?.id)
    expectError(
      await request(setup.app, 'GET', auditUrl(setup.a.id, `/entries/${team.id}`), { headers }),
      404,
      ERROR_CODES.AUDIT_ENTRY_NOT_FOUND,
    )
    expectError(
      await request(setup.app, 'GET', auditUrl(setup.a.id, '/entries'), {
        headers: setup.sessionOf(setup.a.members.uma),
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })

  it('pages newest first with a cursor', async () => {
    const setup = await setupTwoOrgs()
    for (const name of ['One', 'Two', 'Three']) await createTeam(setup, name)
    const headers = setup.sessionOf(setup.a.members.adam)
    const first = expectPage(
      await request(setup.app, 'GET', auditUrl(setup.a.id, '/entries'), {
        headers,
        query: { limit: '2', targetType: 'team' },
      }),
      auditEntryDtoSchema,
    )
    const second = expectPage(
      await request(setup.app, 'GET', auditUrl(setup.a.id, '/entries'), {
        headers,
        query: { limit: '2', targetType: 'team', cursor: first.nextCursor ?? '' },
      }),
      auditEntryDtoSchema,
    )
    expect([...first.data, ...second.data].map((e) => e.targetLabel)).toEqual([
      'Three',
      'Two',
      'One',
    ])
    expect(second.nextCursor).toBeNull()
  })

  it('is append-only for the app role and for the owner', async () => {
    const setup = await setupTwoOrgs()
    await createTeam(setup, 'Locked')
    await expect(
      setup.db.system('test', (tx) =>
        tx.execute(
          sql`update audit_logs set reason = 'edited' where organization_id = ${setup.a.id}`,
        ),
      ),
    ).rejects.toThrow()
    await expect(
      setup.owner.system('test', (tx) =>
        tx.execute(sql`delete from audit_logs where organization_id = ${setup.a.id}`),
      ),
    ).rejects.toThrow()
    await expect(
      setup.owner.global.execute(
        sql`select drop_expired_partitions('audit_logs'::regclass, interval '1 month')`,
      ),
    ).rejects.toThrow()
  })

  it('seals the chain, verifies it and finds an edited entry', async () => {
    const setup = await setupTwoOrgs()
    await createTeam(setup, 'Alpha')
    await createTeam(setup, 'Beta')
    const audit = setup.container.modules.audit.service
    expect(await audit.sealPending()).toBeGreaterThanOrEqual(2)
    expect(await audit.sealPending()).toBe(0)
    const headers = setup.sessionOf(setup.a.members.adam)
    const page = expectPage(
      await request(setup.app, 'GET', auditUrl(setup.a.id, '/entries'), { headers }),
      auditEntryDtoSchema,
    )
    expect(page.data.every((e) => e.integrity.chainSeq !== null)).toBe(true)
    expect((await audit.verify(setup.a.id)).state).toBe('ok')
    const status = expectData(
      await request(setup.app, 'GET', auditUrl(setup.a.id, '/integrity'), { headers }),
      200,
      auditIntegrityStatusDtoSchema,
    )
    expect(status).toMatchObject({ state: 'ok', unsealedCount: 0, mismatch: null })
    expect(status.sealedCount).toBe(page.data.length)

    // Tamper behind the triggers' back, as an attacker with the owner role would have to.
    const [victim] = await setup.db.system('test', (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.action, 'team.created')).limit(1),
    )
    await setup.owner.global.transaction(async (tx) => {
      await tx.execute(sql`alter table audit_logs disable trigger user`)
      await tx.execute(sql`select set_config('app.scope', 'system', true)`)
      await tx.execute(sql`update audit_logs set reason = 'forged' where id = ${victim?.id ?? ''}`)
      await tx.execute(sql`alter table audit_logs enable trigger user`)
    })
    const result = await audit.verify(setup.a.id)
    expect(result).toMatchObject({ state: 'mismatch', mismatch: { entryId: victim?.id } })
  })

  it('queues one on-demand verification at a time', async () => {
    const setup = await setupTwoOrgs()
    const headers = setup.sessionOf(setup.a.members.adam)
    const accepted = await request(setup.app, 'POST', auditUrl(setup.a.id, '/verify'), { headers })
    expect(accepted.statusCode).toBe(202)
    expect(auditIntegrityStatusDtoSchema.parse(accepted.json<{ data: unknown }>().data).state).toBe(
      'unverified',
    )
    expectError(
      await request(setup.app, 'POST', auditUrl(setup.a.id, '/verify'), { headers }),
      409,
      ERROR_CODES.AUDIT_VERIFICATION_RUNNING,
    )
  })
})
