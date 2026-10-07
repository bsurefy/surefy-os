// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  auditLogs,
  dataRequests,
  notifications,
  organizationPurges,
  organizations,
  users,
} from '@/database/tables/index.js'
import {
  dataRequestDtoSchema,
  dataRetentionDtoSchema,
  downloadLinkDtoSchema,
  ERROR_CODES,
  exportDtoSchema,
} from '@surefy/contracts'

import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, expectError, expectPage, request } from '../../../../test/helpers/request.js'

const url = (setup: TwoOrgSetup, path: string) => `/api/v1/orgs/${setup.a.id}${path}`

const actionsOf = async (setup: TwoOrgSetup, orgId: string) => {
  const rows = await setup.db.system('test', (tx) =>
    tx
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, orgId)),
  )
  return rows.map((row) => row.action)
}

const enableTwoFactor = (userId: string) => (setup: TwoOrgSetup) =>
  setup.db.global.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId))

const orgStatus = async (setup: TwoOrgSetup) => {
  const [row] = await setup.db.system('test', (tx) =>
    tx
      .select({ status: organizations.status, scheduledFor: organizations.deletionScheduledFor })
      .from(organizations)
      .where(eq(organizations.id, setup.a.id)),
  )
  return row
}

describe('export all data', () => {
  it('prepares the archive in the background, links it once ready and audits the download', async () => {
    const setup = await setupTwoOrgs()
    const headers = setup.sessionOf(setup.a.members.olivia)
    const created = expectData(
      await request(setup.app, 'POST', url(setup, '/data-requests'), {
        headers,
        payload: { type: 'export' },
      }),
      201,
      dataRequestDtoSchema,
    )
    expect(created).toMatchObject({
      type: 'export',
      status: 'requested',
      requestedBy: { id: setup.a.members.olivia.id },
    })
    expectError(
      await request(setup.app, 'POST', url(setup, `/data-requests/${created.id}/download`), {
        headers,
      }),
      409,
      ERROR_CODES.DATA_REQUEST_NOT_READY,
    )
    await setup.container.modules.dataControl.service.prepareArchive(setup.a.id, created.id)
    const ready = expectData(
      await request(setup.app, 'GET', url(setup, `/data-requests/${created.id}`), { headers }),
      200,
      dataRequestDtoSchema,
    )
    expect(ready.status).toBe('ready')
    expect(ready.sizeBytes).toBeGreaterThan(0)
    const link = expectData(
      await request(setup.app, 'POST', url(setup, `/data-requests/${created.id}/download`), {
        headers,
      }),
      200,
      downloadLinkDtoSchema,
    )
    expect(link.contentType).toBe('application/zip')
    const list = expectPage(
      await request(setup.app, 'GET', url(setup, '/data-requests'), { headers }),
      dataRequestDtoSchema,
    )
    expect(list.data[0]).toMatchObject({ id: created.id, status: 'delivered' })
    expect(await actionsOf(setup, setup.a.id)).toEqual(
      expect.arrayContaining(['organization.export_requested', 'export.downloaded']),
    )
    expectError(
      await request(setup.app, 'POST', url(setup, '/data-requests'), {
        headers: setup.sessionOf(setup.a.members.adam),
        payload: { type: 'export' },
      }),
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    )
  })
})

describe('delete the organization', () => {
  it('needs two-factor, schedules the 30-day hold, notifies Owners and can be canceled', async () => {
    const setup = await setupTwoOrgs()
    const headers = setup.sessionOf(setup.a.members.olivia)
    const post = () =>
      request(setup.app, 'POST', url(setup, '/data-requests'), {
        headers,
        payload: { type: 'deletion', reason: 'Moving elsewhere' },
      })
    expectError(await post(), 403, ERROR_CODES.AUTH_TWO_FACTOR_REQUIRED)
    await enableTwoFactor(setup.a.members.olivia.id)(setup)
    const scheduled = expectData(await post(), 201, dataRequestDtoSchema)
    expect(scheduled).toMatchObject({
      type: 'deletion',
      status: 'scheduled',
      reason: 'Moving elsewhere',
    })
    expect((await orgStatus(setup))?.status).toBe('deletion_scheduled')
    expectError(await post(), 409, ERROR_CODES.DATA_REQUEST_DELETION_PENDING)
    const notified = await setup.db.system('test', (tx) =>
      tx
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId, setup.a.id),
            eq(notifications.type, 'organization.deletion_scheduled'),
          ),
        ),
    )
    expect(notified.map((n) => n.userId)).toEqual([setup.a.members.olivia.id])
    // Only Owners and Admins keep access during the hold.
    expectError(
      await request(setup.app, 'GET', url(setup, '/access/me'), {
        headers: setup.sessionOf(setup.a.members.uma),
      }),
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    )
    const canceled = expectData(
      await request(setup.app, 'POST', url(setup, `/data-requests/${scheduled.id}/cancel`), {
        headers,
      }),
      200,
      dataRequestDtoSchema,
    )
    expect(canceled).toMatchObject({
      status: 'canceled',
      canceledByUserId: setup.a.members.olivia.id,
    })
    expect((await orgStatus(setup))?.status).toBe('active')
    expect(await actionsOf(setup, setup.a.id)).toEqual(
      expect.arrayContaining(['organization.deletion_scheduled', 'organization.deletion_canceled']),
    )
  })

  it('purges the organization after the hold and keeps the purge record', async () => {
    const setup = await setupTwoOrgs()
    await enableTwoFactor(setup.a.members.olivia.id)(setup)
    const scheduled = expectData(
      await request(setup.app, 'POST', url(setup, '/data-requests'), {
        headers: setup.sessionOf(setup.a.members.olivia),
        payload: { type: 'deletion', reason: 'Closing down' },
      }),
      201,
      dataRequestDtoSchema,
    )
    const { retention } = setup.container.modules.dataControl
    expect(await retention.scheduleDuePurges()).toBe(0) // recorded, not due yet
    await setup.db.system('test', (tx) =>
      tx.execute(sql`update organizations set deletion_scheduled_for = now() - interval '1 minute'
        where id = ${setup.a.id}`),
    )
    await setup.db.system('test', (tx) =>
      tx.execute(sql`update organization_purges set scheduled_for = now() - interval '1 minute'
        where organization_id = ${setup.a.id}`),
    )
    expect(await retention.scheduleDuePurges()).toBe(1)
    const [purge] = await setup.db.system('test', (tx) =>
      tx.select().from(organizationPurges).where(eq(organizationPurges.organizationId, setup.a.id)),
    )
    expect(purge).toMatchObject({ status: 'running', attempt: 1, dataRequestId: scheduled.id })
    await retention.purgeOrganization(setup.a.id, purge?.id ?? '')
    const [done] = await setup.db.system('test', (tx) =>
      tx.select().from(organizationPurges).where(eq(organizationPurges.organizationId, setup.a.id)),
    )
    expect(done?.status).toBe('completed')
    expect(done?.certificateSha256).toHaveLength(32)
    expect(done?.rowsDeleted.tables).toMatchObject({ organizations: 1, organization_members: 3 })
    expect(
      Object.values(done?.rowsDeleted.partitionedTables ?? {}).reduce((a, b) => a + b, 0),
    ).toBeGreaterThan(0)
    expect(await orgStatus(setup)).toBeUndefined()
    const remaining = await setup.db.system('test', (tx) =>
      tx.select().from(dataRequests).where(eq(dataRequests.organizationId, setup.a.id)),
    )
    expect(remaining).toEqual([])
    expect(await actionsOf(setup, setup.b.id)).not.toContain('organization.deletion_scheduled')
  })
})

describe('background exports', () => {
  it('prepares a member list for its requester only and refuses what is not available', async () => {
    const setup = await setupTwoOrgs()
    const headers = setup.sessionOf(setup.a.members.adam)
    const post = (kind: string, member = setup.a.members.adam) =>
      request(setup.app, 'POST', url(setup, '/exports'), {
        headers: setup.sessionOf(member),
        payload: { kind, params: { version: 1, format: 'csv' } },
      })
    const queued = expectData(await post('members_csv'), 202, exportDtoSchema)
    expect(queued).toMatchObject({ status: 'queued', containsPersonalData: true })
    await setup.container.modules.dataControl.exports.prepare(setup.a.id, queued.id)
    const ready = expectData(
      await request(setup.app, 'GET', url(setup, `/exports/${queued.id}`), { headers }),
      200,
      exportDtoSchema,
    )
    expect(ready).toMatchObject({ status: 'ready', rowCount: 3, contentType: 'text/csv' })
    expect(ready.fileName).toMatch(/^members-\d{4}-\d{2}-\d{2}\.csv$/)
    const link = expectData(
      await request(setup.app, 'POST', url(setup, `/exports/${queued.id}/download`), { headers }),
      200,
      downloadLinkDtoSchema,
    )
    expect(link.fileName).toBe(ready.fileName)
    expectError(
      await request(setup.app, 'GET', url(setup, `/exports/${queued.id}`), {
        headers: setup.sessionOf(setup.a.members.olivia),
      }),
      404,
      ERROR_CODES.EXPORT_NOT_FOUND,
    )
    expectError(
      await request(setup.app, 'POST', url(setup, `/exports/${queued.id}/retry`), { headers }),
      409,
      ERROR_CODES.EXPORT_NOT_RETRYABLE,
    )
    expectError(await post('members_csv', setup.a.members.uma), 403, ERROR_CODES.ACCESS_FORBIDDEN)
    expectError(await post('audit_csv'), 403, ERROR_CODES.FEATURE_NOT_AVAILABLE)
    expectError(await post('runs_csv'), 422, ERROR_CODES.VALIDATION_FAILED)
    expectError(await post('usage_csv', setup.a.members.uma), 403, ERROR_CODES.ACCESS_FORBIDDEN)
    expect(await actionsOf(setup, setup.a.id)).toEqual(
      expect.arrayContaining(['export.requested', 'export.downloaded']),
    )
  })
})

describe('retention', () => {
  it('lists the retention per data type and cleans up what expired', async () => {
    const setup = await setupTwoOrgs()
    const retention = expectData(
      await request(setup.app, 'GET', url(setup, '/data-control/retention'), {
        headers: setup.sessionOf(setup.a.members.adam),
      }),
      200,
      dataRetentionDtoSchema,
    )
    expect(retention.items).toContainEqual({
      key: 'audit_logs',
      retentionDays: 365,
      configurable: false,
    })
    await setup.db.system('test', (tx) =>
      tx.insert(notifications).values({
        organizationId: setup.a.id,
        userId: setup.a.members.uma.id,
        type: 'export.ready',
        params: { version: 1 },
        createdAt: new Date(Date.now() - 91 * 86_400_000),
      }),
    )
    const removed = await setup.container.modules.dataControl.retention.cleanup()
    expect(removed.notifications).toBe(1)
    await setup.container.modules.dataControl.retention.maintainPartitions()
  })
})
