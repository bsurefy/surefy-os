// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { auditLogs, connections, notifications, outboxEvents } from '@/database/tables/index.js'
import {
  connectionCheckDtoSchema,
  CONNECTIONS_ERROR_CODES,
  ERROR_CODES,
  oauthCompleteDtoSchema,
  oauthStartDtoSchema,
} from '@surefy/contracts'

import {
  GOOGLE_ENV,
  setupConnections,
  stubGoogle,
  type ConnectionsSetup,
  type GoogleStub,
  type Who,
} from './connectionsTestKit.js'
import { expectData } from '../../../../test/helpers/request.js'

const MINUTE = 60_000

const setupGoogle = async (stub: GoogleStub = {}) => {
  const setup = await setupConnections({ env: GOOGLE_ENV })
  stubGoogle(setup.http, stub)
  return setup
}

const signIn = async (
  setup: ConnectionsSetup,
  who: Who = 'adam',
  code = 'code-maya',
  target: Record<string, unknown> = { scope: 'organization' },
) => {
  const started = expectData(
    await setup.call(who, 'POST', '/oauth/start', { providerKey: 'google-drive', ...target }),
    200,
    oauthStartDtoSchema,
  )
  const done = expectData(
    await setup.call(who, 'POST', '/oauth/complete', { state: started.state, code }),
    200,
    oauthCompleteDtoSchema,
  )
  return done.connection
}

const rowOf = async (setup: ConnectionsSetup, id: string) => {
  const [row] = await setup.db.tenant(setup.a.id, (tx) =>
    tx.select().from(connections).where(eq(connections.id, id)),
  )
  return row
}

const expireAt = (setup: ConnectionsSetup, id: string, at: Date) =>
  setup.db.tenant(setup.a.id, (tx) =>
    tx.update(connections).set({ tokenExpiresAt: at }).where(eq(connections.id, id)),
  )

const connectionsOf = (setup: ConnectionsSetup) => setup.container.modules.connections
const principal = (userId: string, teamIds: string[] = []) => ({ userId, teamIds })

describe('refreshing tokens', () => {
  it('renews the tokens that expire within 15 minutes and leaves the others alone', async () => {
    const setup = await setupGoogle()
    const soon = await signIn(setup)
    const later = await signIn(setup, 'adam', 'code-alex')
    await expireAt(setup, soon.id, new Date(Date.now() + 5 * MINUTE))
    await expireAt(setup, later.id, new Date(Date.now() + 60 * MINUTE))

    expect(await connectionsOf(setup).maintenance.refreshDue()).toEqual({
      due: 1,
      refreshed: 1,
      expired: 0,
      failed: 0,
    })
    const adam = principal(setup.a.members.adam.id)
    const renewed = await connectionsOf(setup).service.open(setup.a.id, adam, soon.id)
    expect(renewed.secret).toMatchObject({
      accessToken: 'renewed-1',
      // the app does not repeat the refresh token when it renews
      refreshToken: 'refresh-code-maya',
    })
    const row = await rowOf(setup, soon.id)
    expect(row?.lastRefreshedAt).not.toBeNull()
    expect(row?.tokenExpiresAt?.getTime()).toBeGreaterThan(Date.now() + 30 * MINUTE)
    expect(row?.status).toBe('active')
    expect(
      (await connectionsOf(setup).service.open(setup.a.id, adam, later.id)).secret.accessToken,
    ).toBe('access-code-alex')
  })

  it('expires a connection whose refresh the app refuses, and tells the person who connected it', async () => {
    const setup = await setupGoogle({ refresh: 'invalid_grant' })
    const connection = await signIn(setup)
    await expireAt(setup, connection.id, new Date(Date.now() + 5 * MINUTE))

    expect(await connectionsOf(setup).maintenance.refreshDue()).toMatchObject({
      due: 1,
      expired: 1,
    })
    const row = await rowOf(setup, connection.id)
    expect(row).toMatchObject({
      status: 'expired',
      statusReasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_REFRESH_FAILED,
    })

    // the same transaction wrote the event and the audit entry (system actor)
    const events = await setup.db.system('test', (tx) =>
      tx.select().from(outboxEvents).where(eq(outboxEvents.topic, 'connection.expired')),
    )
    expect(events).toHaveLength(1)
    expect(events[0]?.payload).toEqual({ version: 1, id: connection.id })
    const [entry] = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, 'connection.expired')),
        ),
    )
    expect(entry).toMatchObject({ actorType: 'system', targetId: connection.id })

    // the handler notifies Adam once, however often the event is delivered
    const [event] = events
    const delivery = {
      eventId: event?.id ?? '',
      orgId: setup.a.id,
      topic: 'connection.expired' as const,
      payload: { version: 1 as const, id: connection.id },
    }
    const [handler] = connectionsOf(setup).outboxHandlers
    await handler?.handle(delivery)
    await handler?.handle(delivery)
    const told = await setup.db.tenant(setup.a.id, (tx) =>
      tx.select().from(notifications).where(eq(notifications.type, 'connection.expired')),
    )
    expect(told).toHaveLength(1)
    expect(told[0]).toMatchObject({
      userId: setup.a.members.adam.id,
      targetType: 'connection',
      targetId: connection.id,
    })

    // an expired connection is not swept again, and cannot be used
    expect(await connectionsOf(setup).maintenance.refreshDue()).toMatchObject({ due: 0 })
    await expect(
      connectionsOf(setup).service.open(
        setup.a.id,
        principal(setup.a.members.adam.id),
        connection.id,
      ),
    ).rejects.toMatchObject({ code: CONNECTIONS_ERROR_CODES.CONNECTION_REFRESH_FAILED })

    // a check that passes brings it back
    const checked = expectData(
      await setup.call('adam', 'POST', `/${connection.id}/test`),
      200,
      connectionCheckDtoSchema,
    )
    expect(checked).toMatchObject({ ok: true, connection: { status: 'active' } })
  })

  it('keeps working while the app is unreachable, and expires the token when its time comes', async () => {
    const setup = await setupGoogle({ refresh: 'offline' })
    const connection = await signIn(setup)

    await expireAt(setup, connection.id, new Date(Date.now() + 5 * MINUTE))
    expect(await connectionsOf(setup).maintenance.refreshDue()).toMatchObject({
      due: 1,
      expired: 0,
    })
    expect((await rowOf(setup, connection.id))?.status).toBe('active')

    await expireAt(setup, connection.id, new Date(Date.now() - MINUTE))
    expect(await connectionsOf(setup).maintenance.refreshDue()).toMatchObject({
      due: 1,
      expired: 1,
    })
    expect(await rowOf(setup, connection.id)).toMatchObject({
      status: 'expired',
      statusReasonCode: CONNECTIONS_ERROR_CODES.CONNECTION_TOKEN_EXPIRED,
    })
  })
})

describe('using a connection', () => {
  it('hands the secret to the person it is for, by scope', async () => {
    const setup = await setupGoogle()
    const { bella, ben } = setup.builders
    const supportTeam = await setup.addTeam('Support', [bella])
    const mine = await signIn(setup, 'bella', 'code-maya', { scope: 'personal' })
    const team = await signIn(setup, 'adam', 'code-alex', { scope: 'team', teamId: supportTeam })

    const use = (id: string, who: { id: string }, teams: string[] = []) =>
      connectionsOf(setup).service.open(setup.a.id, principal(who.id, teams), id)
    expect((await use(mine.id, bella)).secret.accessToken).toBe('access-code-maya')
    await expect(use(mine.id, ben)).rejects.toMatchObject({ code: ERROR_CODES.ACCESS_FORBIDDEN })
    // an Admin cannot use a Builder's personal connection either
    await expect(use(mine.id, setup.a.members.adam)).rejects.toMatchObject({
      code: ERROR_CODES.ACCESS_FORBIDDEN,
    })
    expect((await use(team.id, bella, [supportTeam])).providerKey).toBe('google-drive')
    await expect(use(team.id, ben)).rejects.toMatchObject({ code: ERROR_CODES.ACCESS_FORBIDDEN })

    expectData(
      await setup.call('bella', 'POST', `/${mine.id}/revoke`),
      200,
      oauthCompleteDtoSchema.shape.connection,
    )
    await expect(use(mine.id, bella)).rejects.toMatchObject({
      code: CONNECTIONS_ERROR_CODES.CONNECTION_REVOKED,
    })
  })

  it('renews a token that is about to expire before handing it out, and notes the use', async () => {
    const setup = await setupGoogle()
    const connection = await signIn(setup)
    await expireAt(setup, connection.id, new Date(Date.now() + 20_000))
    const use = await connectionsOf(setup).service.open(
      setup.a.id,
      principal(setup.a.members.adam.id),
      connection.id,
    )
    expect(use.secret.accessToken).toBe('renewed-1')

    expect((await rowOf(setup, connection.id))?.lastUsedAt).toBeNull()
    expect(await connectionsOf(setup).lastUsed.flush()).toBe(1)
    expect((await rowOf(setup, connection.id))?.lastUsedAt).not.toBeNull()
    expect(await connectionsOf(setup).lastUsed.flush()).toBe(0)
  })
})

describe('leaving and retention', () => {
  it('disconnects a removed member’s personal connections and keeps the organization’s', async () => {
    const setup = await setupGoogle()
    const { bella } = setup.builders
    const mine = await signIn(setup, 'bella', 'code-maya', { scope: 'personal' })
    const shared = await signIn(setup, 'adam', 'code-alex')

    const removed = await setup.callAt(
      'olivia',
      'DELETE',
      `/api/v1/orgs/${setup.a.id}/members/${bella.memberId}`,
    )
    expect(removed.statusCode).toBe(204)
    expect(await rowOf(setup, mine.id)).toMatchObject({
      status: 'revoked',
      secretCiphertext: null,
      revokedByUserId: setup.a.members.olivia.id,
    })
    expect((await rowOf(setup, shared.id))?.status).toBe('active')
    const [entry] = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.organizationId, setup.a.id), eq(auditLogs.action, 'connection.revoked')),
        ),
    )
    expect(entry?.targetId).toBe(mine.id)
    expect(JSON.stringify(entry?.metadata)).toContain('member_removed')
    // announced, so what synced through it (connector sources) goes too
    const events = await setup.db.system('test', (tx) =>
      tx
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.organizationId, setup.a.id),
            eq(outboxEvents.topic, 'connection.revoked'),
          ),
        ),
    )
    expect(events.map((event) => event.payload)).toEqual([{ version: 1, id: mine.id }])
  })

  it('deletes disconnected connections after 13 months', async () => {
    const setup = await setupGoogle()
    const old = await signIn(setup)
    const recent = await signIn(setup, 'adam', 'code-alex')
    for (const connection of [old, recent]) {
      await setup.call('adam', 'POST', `/${connection.id}/revoke`)
    }
    const fourteenMonthsAgo = new Date()
    fourteenMonthsAgo.setUTCMonth(fourteenMonthsAgo.getUTCMonth() - 14)
    await setup.db.tenant(setup.a.id, (tx) =>
      tx
        .update(connections)
        .set({ revokedAt: fourteenMonthsAgo })
        .where(eq(connections.id, old.id)),
    )

    expect(await connectionsOf(setup).maintenance.deleteExpiredRevoked()).toBe(1)
    expect(await rowOf(setup, old.id)).toBeUndefined()
    expect(await rowOf(setup, recent.id)).toBeDefined()
  })
})
