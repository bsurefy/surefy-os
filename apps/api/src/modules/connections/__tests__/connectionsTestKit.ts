// SPDX-License-Identifier: AGPL-3.0-only
import { teamMembers, teams } from '@/database/tables/index.js'

import { addMember, type TestMember } from '../../../../test/factories/index.js'
import { formOf, type FakeHttp } from '../../../../test/fixtures/fakeHttp.js'
import { authHeaders } from '../../../../test/helpers/auth.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { request } from '../../../../test/helpers/request.js'
import { OutboundError } from '../connectionsHttp.js'

import type { TestAppOptions } from '../../../../test/helpers/testApp.js'

export const connectionsUrl = (orgId: string, path = '') =>
  `/api/v1/orgs/${orgId}/connections${path}`

export type Who = 'olivia' | 'adam' | 'uma' | 'bella' | 'ben'

export interface ConnectionsSetup extends TwoOrgSetup {
  /** Two Builders of A: Bella and Ben. */
  builders: { bella: TestMember; ben: TestMember }
  /** One request as one of A's people to A's connections. */
  call: (
    who: Who,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    payload?: unknown,
    query?: Record<string, string>,
  ) => ReturnType<typeof request>
  /** The same, to another organization or path. */
  callAt: (
    who: Who,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => ReturnType<typeof request>
  /** A team of A with the given members. */
  addTeam: (name: string, members: readonly TestMember[]) => Promise<string>
}

/** A's Owner, Admin and User plus two Builders, all signed in, with fake other apps. */
export async function setupConnections(options: TestAppOptions = {}): Promise<ConnectionsSetup> {
  const setup = await setupTwoOrgs(options)
  const bella = await addMember(setup.container, setup.a.id, 'builder')
  const ben = await addMember(setup.container, setup.a.id, 'builder')
  const headers = new Map([
    ['olivia', setup.sessionOf(setup.a.members.olivia)],
    ['adam', setup.sessionOf(setup.a.members.adam)],
    ['uma', setup.sessionOf(setup.a.members.uma)],
    ['bella', await authHeaders(setup.app, bella)],
    ['ben', await authHeaders(setup.app, ben)],
  ])
  const headersOf = (who: Who) => {
    const found = headers.get(who)
    if (found === undefined) throw new Error(`unknown member ${who}`)
    return found
  }
  return Object.assign(setup, {
    builders: { bella, ben },
    call: (
      who: Who,
      method: 'GET' | 'POST' | 'PATCH',
      path: string,
      payload?: unknown,
      query?: Record<string, string>,
    ) =>
      request(setup.app, method, connectionsUrl(setup.a.id, path), {
        headers: headersOf(who),
        ...(payload === undefined ? {} : { payload }),
        ...(query === undefined ? {} : { query }),
      }),
    callAt: (
      who: Who,
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      payload?: unknown,
    ) =>
      request(setup.app, method, url, {
        headers: headersOf(who),
        ...(payload === undefined ? {} : { payload }),
      }),
    addTeam: async (name: string, members: readonly TestMember[]) =>
      setup.db.tenant(setup.a.id, async (tx) => {
        const [team] = await tx
          .insert(teams)
          .values({ organizationId: setup.a.id, name })
          .returning({ id: teams.id })
        if (team === undefined) throw new Error('team seed failed')
        for (const member of members) {
          await tx
            .insert(teamMembers)
            .values({ organizationId: setup.a.id, teamId: team.id, userId: member.id })
        }
        return team.id
      }),
  })
}

// ── Scripted other apps ─────────────────────────────────────────────────────────────────────────

/** A custom API at `{host}` (any scheme and port) that answers every call with `status`. */
export function stubCustomApi(http: FakeHttp, host = 'api.acme.test', status = 200): void {
  http.on(`://${host}`, { status, body: {} })
}

export interface WhatsAppStub {
  phoneNumberId?: string
  verifiedName?: string
  number?: string
  status?: number
}

export function stubWhatsApp(http: FakeHttp, stub: WhatsAppStub = {}): void {
  const phoneNumberId = stub.phoneNumberId ?? '105500112233'
  http.on(`graph.facebook.com/v21.0/${phoneNumberId}`, {
    status: stub.status ?? 200,
    body: {
      display_phone_number: stub.number ?? '+1 555 0100',
      verified_name: stub.verifiedName ?? 'Acme Support',
    },
  })
}

export interface GoogleAccount {
  email: string
  permissionId: string
}

export const MAYA: GoogleAccount = { email: 'maya@acme.com', permissionId: 'perm-maya' }
export const ALEX: GoogleAccount = { email: 'alex@acme.com', permissionId: 'perm-alex' }

export interface GoogleStub {
  /** The authorization codes the app accepts, and the account each one signs in. */
  codes?: Record<string, GoogleAccount>
  /** `expires_in` of the access tokens. */
  expiresIn?: number
  /** What the refresh token request answers; `ok` by default. */
  refresh?: 'ok' | 'invalid_grant' | 'offline'
}

/** Google Drive's token and "about" endpoints: access tokens are `access-{code}` or `renewed-{n}`. */
export function stubGoogle(http: FakeHttp, stub: GoogleStub = {}) {
  const codes = stub.codes ?? { 'code-maya': MAYA, 'code-alex': ALEX }
  const accounts = new Map<string, GoogleAccount>()
  let renewals = 0
  http.on('oauth2.googleapis.com/token', (call) => {
    const form = formOf(call)
    if (form.get('grant_type') === 'refresh_token') {
      if (stub.refresh === 'offline') return new OutboundError('unreachable', 'down')
      if (stub.refresh === 'invalid_grant') {
        return { status: 400, body: { error: 'invalid_grant', error_description: 'Token revoked' } }
      }
      renewals += 1
      const token = `renewed-${renewals}`
      const current = [...accounts.entries()].find(([key]) => key.startsWith('access-'))
      if (current !== undefined) accounts.set(token, current[1])
      return { body: { access_token: token, expires_in: stub.expiresIn ?? 3600 } }
    }
    const code = form.get('code') ?? ''
    const account = codes[code]
    if (account === undefined) return { status: 400, body: { error: 'invalid_grant' } }
    accounts.set(`access-${code}`, account)
    return {
      body: {
        access_token: `access-${code}`,
        refresh_token: `refresh-${code}`,
        expires_in: stub.expiresIn ?? 3600,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
      },
    }
  })
  http.on('googleapis.com/drive/v3/about', (call) => {
    const token = (call.request.headers?.authorization ?? '').replace('Bearer ', '')
    const account = accounts.get(token)
    if (account === undefined) return { status: 401, body: { error: { code: 401 } } }
    return { body: { user: { emailAddress: account.email, permissionId: account.permissionId } } }
  })
  http.on('oauth2.googleapis.com/revoke', { status: 200 })
}

export const GOOGLE_ENV = {
  CONNECTIONS_OAUTH_GOOGLE_DRIVE_CLIENT_ID: 'google-client-id',
  CONNECTIONS_OAUTH_GOOGLE_DRIVE_CLIENT_SECRET: 'google-client-secret',
} as const
