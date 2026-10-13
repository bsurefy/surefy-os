// SPDX-License-Identifier: AGPL-3.0-only

import { teamMembers, teams } from '@/database/tables/index.js'
import type { Approver, ApprovalPayload } from '@surefy/contracts'

import { addMember, type TestMember } from '../../../../test/factories/index.js'
import { authHeaders } from '../../../../test/helpers/auth.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { request } from '../../../../test/helpers/request.js'
import { DEFAULT_GUARD } from '../approvals.types.js'

import type { TestAppOptions } from '../../../../test/helpers/testApp.js'
import type { ApprovalLimits, ApprovalsGuard, CreateApprovalInput } from '../approvals.types.js'
import type { sql } from 'drizzle-orm'

export const approvalsUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/approvals${path}`

export type Who = 'olivia' | 'adam' | 'uma' | 'bella' | 'ben'

export interface ApprovalsSetup extends TwoOrgSetup {
  /** Two Builders of A: Bella and Ben. */
  builders: { bella: TestMember; ben: TestMember }
  /** One request as one of A's people to A's approvals. */
  call: (
    who: Who,
    method: 'GET' | 'POST',
    path: string,
    payload?: unknown,
    query?: Record<string, string>,
  ) => ReturnType<typeof request>
  /** Creates an approval of A the way Guard does; returns its id. */
  seed: (input?: Partial<CreateApprovalInput>) => Promise<string>
  /** A team of A with the given members. */
  addTeam: (name: string, members: readonly TestMember[]) => Promise<string>
  /** Test-only SQL as the owner, for states the API cannot reach (a wait that ran out). */
  ownerSql: (statement: ReturnType<typeof sql>) => Promise<void>
}

export const aiPayload = (
  input: Record<string, unknown> = { amount: 340, orderId: '1182' },
): ApprovalPayload => ({
  version: 1,
  kind: 'ai_action',
  action: { name: 'payments.refund', input },
  reasoning: [{ text: 'The customer was charged twice', confidence: 0.7 }],
  sources: [],
  stepRef: { seq: 4 },
})

export const bridgePayload = (): ApprovalPayload => ({
  version: 1,
  kind: 'bridge_install',
  bridgeId: '0198f3a0-0000-7000-8000-000000000001',
  versionId: '0198f3a0-0000-7000-8000-000000000002',
  requestedScopes: ['contacts.read'],
})

/** Guard settings with the given values over the defaults. */
export const guardWith = (limits: Partial<ApprovalLimits>): ApprovalsGuard => ({
  ...DEFAULT_GUARD,
  limits: async (tx, orgId) => ({ ...(await DEFAULT_GUARD.limits(tx, orgId)), ...limits }),
})

/** A's Owner, Admin and User plus two Builders, all signed in. */
export async function setupApprovals(options: TestAppOptions = {}): Promise<ApprovalsSetup> {
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
  const system = {
    orgId: setup.a.id,
    userId: null,
    via: 'system' as const,
    teamIds: [],
    access: { permissions: [] },
  }
  return Object.assign(setup, {
    builders: { bella, ben },
    call: (
      who: Who,
      method: 'GET' | 'POST',
      path: string,
      payload?: unknown,
      query?: Record<string, string>,
    ) =>
      request(setup.app, method, approvalsUrl(setup.a.id, path), {
        headers: headersOf(who),
        ...(payload === undefined ? {} : { payload }),
        ...(query === undefined ? {} : { query }),
      }),
    seed: async (input: Partial<CreateApprovalInput> = {}) => {
      const assignees: readonly Approver[] = input.assignees ?? [
        { type: 'user', id: setup.a.members.uma.id },
      ]
      const created = await setup.db.tenant(setup.a.id, (tx) =>
        setup.container.modules.approvals.service.create(tx, system, {
          kind: 'ai_action',
          title: 'Refund $340 to order #1182',
          payload: aiPayload(),
          ruleRef: 'guardrail-refunds',
          confidence: 0.55,
          ...input,
          assignees,
        }),
      )
      return created.id
    },
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
    ownerSql: async (statement: ReturnType<typeof sql>) => {
      await setup.owner.system('test', (tx) => tx.execute(statement))
    },
  })
}
