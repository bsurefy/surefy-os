// SPDX-License-Identifier: AGPL-3.0-only

import { teamMembers, teams } from '@/database/tables/index.js'
import { MlInputError } from '@/integrations/ml/index.js'
import { guardrailDtoSchema } from '@surefy/contracts'

import { addMember, seedAgent, type TestMember } from '../../../../test/factories/index.js'
import { authHeaders } from '../../../../test/helpers/auth.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../../../../test/helpers/orgSetup.js'
import { expectData, request } from '../../../../test/helpers/request.js'
import { GuardEngine } from '../guard.engine.js'
import { LimitCounters } from '../guard.limits.js'
import { GuardRepository } from '../guard.repository.js'
import { GuardRuleSets } from '../guard.ruleSet.js'

import type { TestAppOptions } from '../../../../test/helpers/testApp.js'
import type { GuardModelDecider } from '../guard.types.js'
import type { PiiFinding, PiiInput, MlService } from '@/integrations/ml/index.js'
import type { sql } from 'drizzle-orm'

/** The agent the checks run for: approvals point at it, so it exists in organization A. */
export const GUARD_AGENT_ID = '0198f3a0-0000-7000-8000-0000000000a9'

export const guardUrl = (orgId: string, path = '') => `/api/v1/orgs/${orgId}/guard${path}`

/** The ML service for Guard tests: finds emails, cards, one name and the custom patterns it is given. */
export interface FakePii extends MlService {
  calls: { method: 'detect' | 'mask'; input: PiiInput }[]
  /** The next call fails like this instead of answering. */
  failWith: Error | null
}

const BUILT_IN: Record<string, { type: PiiFinding['type']; pattern: RegExp; placeholder: string }> =
  {
    email: {
      type: 'email',
      pattern: /[\w.+-]{1,64}@[\w-]{1,63}\.[\w.]{2,63}/g,
      placeholder: '[EMAIL]',
    },
    payment_card: {
      type: 'payment_card',
      pattern: /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g,
      placeholder: '[PAYMENT_CARD]',
    },
    person_name: { type: 'person_name', pattern: /Omar Haddad/g, placeholder: '[PERSON_NAME]' },
  }

interface Hit {
  finding: PiiFinding
  placeholder: string
}

function hitsIn(text: string, input: PiiInput): Hit[] {
  const hits: Hit[] = []
  const types = input.types ?? (Object.keys(BUILT_IN) as never[])
  for (const type of types) {
    const known = BUILT_IN[type]
    if (known === undefined) continue
    for (const match of text.matchAll(known.pattern)) {
      hits.push({
        finding: {
          type: known.type,
          customLabel: null,
          start: match.index,
          end: match.index + match[0].length,
          score: 0.9,
        },
        placeholder: known.placeholder,
      })
    }
  }
  for (const custom of input.customPatterns ?? []) {
    let pattern: RegExp
    try {
      pattern = new RegExp(custom.pattern, 'g')
    } catch {
      throw new MlInputError(
        'ML service rejected the request: ML_VALIDATION_FAILED',
        'ML_VALIDATION_FAILED',
      )
    }
    for (const match of text.matchAll(pattern)) {
      hits.push({
        finding: {
          type: 'custom',
          customLabel: custom.label,
          start: match.index,
          end: match.index + match[0].length,
          score: 0.9,
        },
        placeholder: `[${custom.label.toUpperCase()}]`,
      })
    }
  }
  return hits.sort((left, right) => left.finding.start - right.finding.start)
}

export function createFakePii(): FakePii {
  const fake: FakePii = {
    calls: [],
    failWith: null,
    parseDocument: () => Promise.reject(new Error('not used by guard')),
    detectPii(input) {
      fake.calls.push({ method: 'detect', input })
      if (fake.failWith !== null) return Promise.reject(fake.failWith)
      return Promise.resolve({
        language: 'en',
        results: input.texts.map((text) => ({
          findings: hitsIn(text, input).map((hit) => hit.finding),
        })),
      })
    },
    maskPii(input) {
      fake.calls.push({ method: 'mask', input })
      if (fake.failWith !== null) return Promise.reject(fake.failWith)
      return Promise.resolve({
        language: 'en',
        results: input.texts.map((text) => {
          const hits = hitsIn(text, input)
          let masked = ''
          let at = 0
          for (const hit of hits) {
            masked += text.slice(at, hit.finding.start) + hit.placeholder
            at = hit.finding.end
          }
          return { text: masked + text.slice(at), findings: hits.map((hit) => hit.finding) }
        }),
      })
    },
  }
  return fake
}

export type Who = 'olivia' | 'adam' | 'uma' | 'bella'

export interface GuardSetup extends TwoOrgSetup {
  pii: FakePii
  bella: TestMember
  /** One request as one of A's people to A's Guard routes. */
  call: (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    payload?: unknown,
    query?: Record<string, string>,
  ) => ReturnType<typeof request>
  /** A team of A with the given members; returns its id. */
  addTeam: (name: string, members: readonly TestMember[]) => Promise<string>
  /** A guard engine over this app's database, with a scripted double check and a fixed clock. */
  engine: (options?: { decider?: GuardModelDecider; now?: () => Date }) => GuardEngine
  /** Test-only SQL as the owner. */
  ownerSql: (statement: ReturnType<typeof sql>) => Promise<void>
}

/** A's Owner, Admin and User plus a Builder (Bella), all signed in, with a fake ML service. */
export async function setupGuard(options: TestAppOptions = {}): Promise<GuardSetup> {
  const pii = createFakePii()
  const setup = await setupTwoOrgs({ ml: pii, ...options })
  const bella = await addMember(setup.container, setup.a.id, 'builder')
  const headers = new Map([
    ['olivia', setup.sessionOf(setup.a.members.olivia)],
    ['adam', setup.sessionOf(setup.a.members.adam)],
    ['uma', setup.sessionOf(setup.a.members.uma)],
    ['bella', await authHeaders(setup.app, bella)],
  ])
  const headersOf = (who: Who) => {
    const found = headers.get(who)
    if (found === undefined) throw new Error(`unknown member ${who}`)
    return found
  }
  await seedAgent(setup.container, setup.a.id, { id: GUARD_AGENT_ID, name: 'Refund agent' })
  const repository = new GuardRepository()
  return Object.assign(setup, {
    pii,
    bella,
    call: (
      who: Who,
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      payload?: unknown,
      query?: Record<string, string>,
    ) =>
      request(setup.app, method, guardUrl(setup.a.id, path), {
        headers: headersOf(who),
        ...(payload === undefined ? {} : { payload }),
        ...(query === undefined ? {} : { query }),
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
    engine: (engineOptions: { decider?: GuardModelDecider; now?: () => Date } = {}) =>
      new GuardEngine({
        db: setup.db,
        ruleSets: new GuardRuleSets({ db: setup.db, cache: setup.container.cache, repository }),
        counters: new LimitCounters(setup.container.cache),
        approvals: setup.container.modules.approvals.service,
        decider: engineOptions.decider ?? {
          decide: () => Promise.reject(new Error('no double check scripted')),
        },
        audit: setup.container.modules.audit.service,
        logger: setup.container.logger,
        ...(engineOptions.now === undefined ? {} : { now: engineOptions.now }),
      }),
    ownerSql: async (statement: ReturnType<typeof sql>) => {
      await setup.owner.system('test', (tx) => tx.execute(statement))
    },
  })
}

/** Adds a guardrail as Adam (an Admin of A); returns its id. */
export async function makeRule(setup: GuardSetup, body: unknown): Promise<string> {
  const response = await setup.call('adam', 'POST', '/guardrails', body)
  return expectData(response, 201, guardrailDtoSchema).id
}

/** A blocked-action guardrail body. */
export const blockedBody = (name: string, action: string, extra: Record<string, unknown> = {}) => ({
  name,
  scope: 'organization',
  definition: { version: 1, kind: 'blocked_action', match: { action } },
  ...extra,
})

/** An approval-rule guardrail body, with Finance (a team) or Admins as approvers. */
export const approvalRuleBody = (
  name: string,
  action: string,
  approvers: readonly unknown[] = [{ type: 'role', id: 'admin' }],
  overrides: Record<string, unknown> = {},
) => ({
  name,
  scope: 'organization',
  definition: {
    version: 1,
    kind: 'approval_rule',
    match: { action },
    approvers,
    waitMinutes: null,
    onTimeout: null,
    escalateTo: [],
    risk: 'medium',
    ...overrides,
  },
})
