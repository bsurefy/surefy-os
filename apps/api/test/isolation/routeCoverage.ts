// SPDX-License-Identifier: AGPL-3.0-only
import { API_PREFIX } from '@/app.js'

import { routeKey, type RouteKey, type RouteTableEntry } from './routeTable.js'

import type { IsolationFixture } from './isolationFixture.js'

/**
 * How the isolation suite treats a route (testing.md, §4):
 * - `public`: no access guard on purpose (`config: { public: true }`, or outside /api/v1); needs a reason;
 * - `authenticated`: a signed-in person acting on their own data, without `:orgId`;
 * - `orgScoped`: every route with `:orgId`; B's Owner must get 404 for A's resources;
 * - `installAdmin`: install-wide administration; an organization Owner gets 403 or 404.
 */
export type RouteClass = 'public' | 'authenticated' | 'orgScoped' | 'installAdmin'

export interface RouteCoverage {
  class: RouteClass
  /** Required for `public`: why anyone may call it. */
  reason?: string
  /** A valid body, so validation does not answer before the access check does. */
  payload?: (fixture: IsolationFixture) => unknown
}

const PUBLIC_LOOKUP = 'Public lookup by slug or invitation token, rate limited (publicLookup)'

/**
 * Every route of the app, by `METHOD /full/path`. The suite fails when the route table has a
 * route that is not listed here, or this list has a route the app no longer registers, so a new
 * module adds one line per route. Org-scoped routes get the cross-tenant attempts generated from
 * this entry; a new path parameter (`:agentId`) also needs A's real value in `isolationFixture.ts`.
 */
export const ROUTE_COVERAGE: Readonly<Record<RouteKey, RouteCoverage>> = {
  // Outside /api/v1: not under the boot check.
  'GET /health/live': { class: 'public', reason: 'Liveness probe, no data' },
  'GET /health/ready': { class: 'public', reason: 'Readiness probe, dependency status only' },
  'GET /api/auth/*': { class: 'public', reason: 'Better Auth handler; checks its own sessions' },
  'POST /api/auth/*': { class: 'public', reason: 'Better Auth handler; checks its own sessions' },
  'GET /api/docs': { class: 'public', reason: 'API reference, when API_DOCS_ENABLED' },
  'GET /api/docs/': { class: 'public', reason: 'API reference, when API_DOCS_ENABLED' },
  'GET /api/docs/js/scalar.js': { class: 'public', reason: 'API reference script' },
  'GET /api/docs/openapi.json': { class: 'public', reason: 'OpenAPI document, no data' },
  'GET /api/docs/openapi.yaml': { class: 'public', reason: 'OpenAPI document, no data' },

  // auth
  'GET /api/v1/auth/options': { class: 'public', reason: 'Sign-in methods for the sign-in page' },
  'GET /api/v1/me': { class: 'authenticated' },
  'PATCH /api/v1/me': {
    class: 'authenticated',
    payload: (f) => ({ name: 'Bea Intruder', lastOrganizationId: f.orgA.id }),
  },
  'GET /api/v1/me/sessions': { class: 'authenticated' },
  'POST /api/v1/me/sessions/revoke-others': { class: 'authenticated' },
  'DELETE /api/v1/me/sessions/:sessionId': { class: 'authenticated' },

  // organizations
  'GET /api/v1/organizations/slug-availability': { class: 'public', reason: PUBLIC_LOOKUP },
  'POST /api/v1/organizations': {
    class: 'authenticated',
    payload: () => ({ name: 'Bea Second', slug: 'bea-second' }),
  },
  'GET /api/v1/orgs/:orgId': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId': { class: 'orgScoped', payload: () => ({ name: 'Taken Over' }) },

  // members
  'GET /api/v1/orgs/:orgId/members': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/members/bulk': {
    class: 'orgScoped',
    payload: (f) => ({ action: 'deactivate', memberIds: [f.params.memberId] }),
  },
  'GET /api/v1/orgs/:orgId/members/me/preferences': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId/members/me/preferences': {
    class: 'orgScoped',
    payload: () => ({ tableDensity: 'comfortable' }),
  },
  'GET /api/v1/orgs/:orgId/members/:memberId': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId/members/:memberId': {
    class: 'orgScoped',
    payload: (f) => ({ primaryTeamId: f.params.teamId }),
  },
  'DELETE /api/v1/orgs/:orgId/members/:memberId': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/members/:memberId/deactivate': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/members/:memberId/reactivate': { class: 'orgScoped' },

  // members › invitations
  'GET /api/v1/orgs/:orgId/invitations': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/invitations': {
    class: 'orgScoped',
    payload: (f) => ({ email: 'intruder@example.test', role: 'user', teamIds: [f.params.teamId] }),
  },
  'POST /api/v1/orgs/:orgId/invitations/:invitationId/resend': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/invitations/:invitationId/link': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/invitations/:invitationId/revoke': { class: 'orgScoped' },
  'GET /api/v1/invitations/:token': { class: 'public', reason: PUBLIC_LOOKUP },
  'POST /api/v1/invitations/:token/request-reissue': {
    class: 'public',
    reason: 'Expired-link reissue request by token; reveals nothing, rate limited',
  },
  'POST /api/v1/invitations/:token/accept': { class: 'authenticated' },

  // notifications
  'GET /api/v1/orgs/:orgId/notifications': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/notifications/unread-count': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/notifications/read-all': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/notifications/:notificationId/read': { class: 'orgScoped' },

  // teams
  'GET /api/v1/orgs/:orgId/teams': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/teams': {
    class: 'orgScoped',
    payload: (f) => ({ name: 'Intruders', memberUserIds: [f.params.userId] }),
  },
  'GET /api/v1/orgs/:orgId/teams/:teamId': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId/teams/:teamId': {
    class: 'orgScoped',
    payload: () => ({ name: 'Mine' }),
  },
  'DELETE /api/v1/orgs/:orgId/teams/:teamId': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/teams/:teamId/deletion-impact': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/teams/:teamId/members': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/teams/:teamId/members': {
    class: 'orgScoped',
    payload: (f) => ({ userIds: [f.orgB.ownerId] }),
  },
  'DELETE /api/v1/orgs/:orgId/teams/:teamId/members/:userId': { class: 'orgScoped' },
}

/** One covered route, with its method and path split out of the key. */
export interface CoveredRoute extends RouteCoverage {
  key: RouteKey
  method: RouteTableEntry['method']
  url: string
}

export const coveredRoutes = (cls: RouteClass): CoveredRoute[] =>
  Object.entries(ROUTE_COVERAGE)
    .filter(([, coverage]) => coverage.class === cls)
    .map(([key, coverage]) => {
      const [method = '', url = ''] = key.split(' ')
      return { ...coverage, key: key as RouteKey, method: method as CoveredRoute['method'], url }
    })

/** Where an entry's class contradicts the route it classifies. */
function classMismatches(route: RouteTableEntry, entry: RouteCoverage): string[] {
  const key = routeKey(route)
  const guarded = route.url.startsWith(`${API_PREFIX}/`)
  const isPublic = entry.class === 'public'
  const findings: string[] = []
  if (route.url.includes(':orgId') !== (entry.class === 'orgScoped')) {
    findings.push(`${key}: classified ${entry.class}; orgScoped is exactly the routes with :orgId`)
  }
  if (guarded && route.isPublic !== isPublic) {
    findings.push(`${key}: config.public is ${route.isPublic}, classified ${entry.class}`)
  }
  if (!guarded && !isPublic) {
    findings.push(`${key}: outside ${API_PREFIX} has no access guard; classify it public`)
  }
  if (isPublic && (entry.reason ?? '').trim() === '') {
    findings.push(`${key}: a public route needs a reason`)
  }
  if (!isPublic && !route.guarded) {
    findings.push(`${key}: classified ${entry.class} but has no preHandler guard`)
  }
  return findings
}

/**
 * Compares the route table with `ROUTE_COVERAGE`: routes without an entry, entries without a
 * route, and entries whose class contradicts the route itself (`:orgId` must be `orgScoped`,
 * `config: { public: true }` must be `public` and the reverse, routes outside /api/v1 are
 * `public`, a public route says why).
 */
export function compareWithRouteTable(
  table: readonly RouteTableEntry[],
  coverage: Readonly<Record<string, RouteCoverage>> = ROUTE_COVERAGE,
): string[] {
  const findings: string[] = []
  const registered = new Set<string>()
  for (const route of table) {
    const key = routeKey(route)
    registered.add(key)
    const entry = coverage[key]
    if (entry === undefined) {
      findings.push(`${key}: not classified in test/isolation/routeCoverage.ts`)
    } else {
      findings.push(...classMismatches(route, entry))
    }
  }
  for (const key of Object.keys(coverage)) {
    if (!registered.has(key)) findings.push(`${key}: classified but not registered by the app`)
  }
  return findings
}
