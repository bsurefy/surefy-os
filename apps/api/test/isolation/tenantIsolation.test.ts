// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_PREFIX } from '@/app.js'

import {
  crossTenantCases,
  checkCrossTenantCase,
  fillPath,
  type OrgScopedRoute,
} from './crossTenant.js'
import { seedIsolationFixture, type IsolationFixture } from './isolationFixture.js'
import { findLeaks } from './leaks.js'
import { compareWithRouteTable, coveredRoutes, type CoveredRoute } from './routeCoverage.js'
import { routeTableOf } from './routeTable.js'
import { changedTables, collectDatabaseLeaks, snapshotOrganization } from './tenantRows.js'
import { setupTwoOrgs, type TwoOrgSetup } from '../helpers/orgSetup.js'
import { request } from '../helpers/request.js'
import { createTestApp } from '../helpers/testApp.js'

import type * as FastifyModule from 'fastify'

/**
 * The tenant-isolation suite generated from the route table (testing.md, §4). The app records
 * every route it registers (`recordRoutes`); `routeCoverage.ts` classifies each one, and the
 * attempts below are generated from that classification.
 */
vi.mock('fastify', async (importOriginal) => {
  const { recordRoutes } = await import('./routeTable.js')
  return recordRoutes(await importOriginal<typeof FastifyModule>())
})

interface Context {
  setup: TwoOrgSetup
  fixture: IsolationFixture
  before: Map<string, string>
}

/** Apps opened by the running test; closed after it, so ~40 tests do not hold ~40 pools. */
const opened: { close(): Promise<void> }[] = []

afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()))
})

const prepare = async (): Promise<Context> => {
  const setup = await setupTwoOrgs()
  opened.push(setup)
  const fixture = await seedIsolationFixture(setup)
  return { setup, fixture, before: await snapshotOrganization(setup.db, setup.a.id) }
}

/** A's markers minus the values the caller sent itself: echoing a caller's own input reveals nothing. */
const unknownMarkers = (markers: readonly string[], ...sent: unknown[]): string[] => {
  const text = sent.map((value) => (value === undefined ? '' : JSON.stringify(value))).join(' ')
  return markers.filter((marker) => !text.includes(marker))
}

const payloadOf = (payload: unknown) => (payload === undefined ? {} : { payload })

/** No request without a session reaches a guarded route's handler. */
const checkAnonymous = async (
  { setup }: Context,
  route: CoveredRoute,
  url: string,
  payload: unknown,
): Promise<string[]> => {
  const response = await request(setup.app, route.method, url, payloadOf(payload))
  return response.statusCode === 401 ? [] : [`anonymous: expected 401, got ${response.statusCode}`]
}

/**
 * After B's attempts: A's tenant rows are exactly as before, B's rows reference nothing of A, and
 * A's Owner is still signed in (B cannot end another person's session).
 */
const checkAftermath = async ({ setup, fixture, before }: Context): Promise<string[]> => {
  const findings: string[] = []
  const after = await snapshotOrganization(setup.db, setup.a.id)
  for (const table of changedTables(before, after)) findings.push(`A's rows in ${table} changed`)
  const rowsOfB = [...(await snapshotOrganization(setup.db, setup.b.id)).values()].join('\n')
  for (const marker of findLeaks(rowsOfB, fixture.markers)) {
    findings.push(`B's rows now contain ${JSON.stringify(marker)}`)
  }
  const me = await request(setup.app, 'GET', `${API_PREFIX}/me`, {
    headers: setup.sessionOf(setup.a.members.olivia),
  })
  if (me.statusCode !== 200) findings.push(`A's Owner lost their session (${me.statusCode})`)
  return findings
}

const resourceParams = (path: string): string[] =>
  [...path.matchAll(/:([A-Za-z_]\w*)/g)].map((match) => match[1] ?? '').filter((n) => n !== 'orgId')

describe('route table', () => {
  it('classifies every registered route in routeCoverage.ts', async () => {
    const testApp = await createTestApp({ env: { API_DOCS_ENABLED: 'true' } })
    opened.push(testApp)
    const { app } = testApp
    expect(compareWithRouteTable(routeTableOf(app))).toEqual([])
  })

  it('reports unclassified, stale and misclassified routes', () => {
    const table = [
      { method: 'GET', url: '/api/v1/orgs/:orgId/agents', isPublic: false, guarded: true },
      { method: 'GET', url: '/api/v1/me', isPublic: false, guarded: true },
      { method: 'GET', url: '/api/v1/lookup', isPublic: true, guarded: false },
    ] as const
    expect(
      compareWithRouteTable(table, {
        'GET /api/v1/me': { class: 'orgScoped' },
        'GET /api/v1/lookup': { class: 'public' },
        'GET /api/v1/gone': { class: 'authenticated' },
      }),
    ).toEqual([
      'GET /api/v1/orgs/:orgId/agents: not classified in test/isolation/routeCoverage.ts',
      'GET /api/v1/me: classified orgScoped; orgScoped is exactly the routes with :orgId',
      'GET /api/v1/lookup: a public route needs a reason',
      'GET /api/v1/gone: classified but not registered by the app',
    ])
  })
})

describe('org-scoped routes: B never reaches A', () => {
  it.each(coveredRoutes('orgScoped'))('$key', async (route) => {
    const context = await prepare()
    const { setup, fixture } = context
    const path = route.url.slice(API_PREFIX.length)
    const payload = route.payload?.(fixture)
    const markers = unknownMarkers(fixture.markers, payload)
    const orgRoute: OrgScopedRoute = { method: route.method, path, ...payloadOf(payload) }
    const hasResource = resourceParams(path).length > 0
    const findings: string[] = []

    // With a resource id: B's orgId and A's ids → 404. Without: only A's orgId → 404 ORGANIZATION_NOT_FOUND.
    for (const testCase of crossTenantCases(orgRoute, setup.subjects(fixture.params, markers))) {
      if (!hasResource && testCase.expected.code === undefined) continue
      findings.push(...(await checkCrossTenantCase(setup.app, testCase, markers)))
    }
    if (!hasResource) {
      // B's own organization, with A's ids in the body where the route takes any.
      const own = await request(
        setup.app,
        route.method,
        `${API_PREFIX}${fillPath(path, { orgId: fixture.orgB.id })}`,
        {
          headers: setup.sessionOf(setup.b.members.bea),
          ...payloadOf(payload),
        },
      )
      if (own.statusCode >= 500) findings.push(`B's orgId: ${own.statusCode} ${own.body}`)
      for (const marker of findLeaks(own.body, markers)) {
        findings.push(`B's orgId: body contains ${JSON.stringify(marker)}`)
      }
    }
    const urlOfA = `${API_PREFIX}${fillPath(path, { ...fixture.params, orgId: fixture.orgA.id })}`
    findings.push(...(await checkAnonymous(context, route, urlOfA, payload)))
    findings.push(...(await checkAftermath(context)))
    expect(findings, route.key).toEqual([])
  })
})

describe("authenticated routes: B's member acts only on their own data", () => {
  it.each(coveredRoutes('authenticated'))('$key', async (route) => {
    const context = await prepare()
    const { setup, fixture } = context
    const url = fillPath(route.url, fixture.params)
    const payload = route.payload?.(fixture)
    const findings = await checkAnonymous(context, route, url, payload)
    const response = await request(setup.app, route.method, url, {
      headers: setup.sessionOf(setup.b.members.bea),
      ...payloadOf(payload),
    })
    if (response.statusCode >= 500) findings.push(`${response.statusCode} ${response.body}`)
    for (const marker of findLeaks(response.body, unknownMarkers(fixture.markers, url, payload))) {
      findings.push(`body contains ${JSON.stringify(marker)}`)
    }
    findings.push(...(await checkAftermath(context)))
    expect(findings, route.key).toEqual([])
  })
})

const installAdminRoutes = coveredRoutes('installAdmin')

describe.skipIf(installAdminRoutes.length === 0)(
  'install-admin routes: an Owner is not an admin',
  () => {
    it.each(installAdminRoutes)('$key', async (route) => {
      const context = await prepare()
      const { setup, fixture } = context
      const url = fillPath(route.url, fixture.params)
      const payload = route.payload?.(fixture)
      const findings = await checkAnonymous(context, route, url, payload)
      const response = await request(setup.app, route.method, url, {
        headers: setup.sessionOf(setup.b.members.bea),
        ...payloadOf(payload),
      })
      if (response.statusCode !== 403 && response.statusCode !== 404) {
        findings.push(`B's Owner: expected 403 or 404, got ${response.statusCode}`)
      }
      findings.push(...(await checkAftermath(context)))
      expect(findings, route.key).toEqual([])
    })
  },
)

describe('database layer', () => {
  it("shows no row of A to B's scopes in any tenant table, without a tenant filter", async () => {
    const { setup } = await prepare()
    const findings = await collectDatabaseLeaks(setup.db, {
      a: setup.a.id,
      b: setup.b.id,
      bMemberUserId: setup.b.members.bea.id,
    })
    expect(findings).toEqual([])
  })
})
