// SPDX-License-Identifier: AGPL-3.0-only
import { API_PREFIX } from '@/app.js'

import { routeKey, type RouteKey, type RouteTableEntry } from './routeTable.js'
import { testKey } from '../fixtures/fakeAi.js'

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
  /** A valid query string, for routes that require one (org-scoped routes). */
  query?: Readonly<Record<string, string>>
}

const INSIGHTS_RANGE = {
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
  timeZone: 'UTC',
} as const

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

  'GET /api/v1/files': {
    class: 'public',
    reason: 'Signed local-storage download: the signature in the query is the authorization',
  },
  'PUT /api/v1/files': {
    class: 'public',
    reason: 'Signed local-storage upload: the signature in the query is the authorization',
  },

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

  // setup
  'GET /api/v1/setup/status': {
    class: 'public',
    reason: 'First-run setup state; the server check only while no organization exists',
  },
  'POST /api/v1/setup': {
    class: 'public',
    reason: 'First-run setup; refused once an organization exists, SETUP_TOKEN when set',
  },
  'POST /api/v1/orgs/:orgId/setup/complete': {
    class: 'orgScoped',
    payload: () => ({ skippedSteps: ['model'] }),
  },
  'GET /api/v1/orgs/:orgId/setup/checklist': { class: 'orgScoped' },

  // install
  'GET /api/v1/install/settings': { class: 'installAdmin' },
  'PATCH /api/v1/install/settings': {
    class: 'installAdmin',
    payload: () => ({ signupPolicy: 'open' }),
  },
  'POST /api/v1/install/smtp/test': {
    class: 'installAdmin',
    payload: () => ({ to: 'intruder@example.test' }),
  },
  'GET /api/v1/install/admins': { class: 'installAdmin' },
  'POST /api/v1/install/admins': {
    class: 'installAdmin',
    payload: (f) => ({ userId: f.orgB.ownerId }),
  },
  'DELETE /api/v1/install/admins/:userId': { class: 'installAdmin' },
  'GET /api/v1/install/organizations': { class: 'installAdmin' },

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

  // access
  'GET /api/v1/orgs/:orgId/access/me': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/access/members/:userId': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/access/teams/:teamId': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/access/policy': { class: 'orgScoped' },
  'PUT /api/v1/orgs/:orgId/access/policy': {
    class: 'orgScoped',
    payload: () => ({ version: 1, modules: ['chat'] }),
  },
  'GET /api/v1/orgs/:orgId/teams/:teamId/access-policy': { class: 'orgScoped' },
  'PUT /api/v1/orgs/:orgId/teams/:teamId/access-policy': {
    class: 'orgScoped',
    payload: () => ({ version: 1, tools: { webSearch: false } }),
  },

  // audit
  // chats
  'GET /api/v1/orgs/:orgId/chats': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/chats/:chatId': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId/chats/:chatId': {
    class: 'orgScoped',
    payload: () => ({ title: 'Taken over' }),
  },
  'DELETE /api/v1/orgs/:orgId/chats/:chatId': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/chats/:chatId/restore': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/chats/:chatId/messages': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/chats/:chatId/messages': {
    class: 'orgScoped',
    payload: () => ({ trigger: 'submit', text: 'hello from B' }),
  },
  'GET /api/v1/orgs/:orgId/chats/:chatId/messages/:messageId/sources/:index': {
    class: 'orgScoped',
  },
  'PUT /api/v1/orgs/:orgId/chats/:chatId/messages/:messageId/feedback': {
    class: 'orgScoped',
    payload: () => ({ rating: 'not_helpful' }),
  },
  'DELETE /api/v1/orgs/:orgId/chats/:chatId/messages/:messageId/feedback': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/chats/:chatId/attachments': {
    class: 'orgScoped',
    payload: () => ({ fileName: 'b.txt', contentType: 'text/plain', sizeBytes: 5 }),
  },
  'POST /api/v1/orgs/:orgId/chats/:chatId/attachments/:attachmentId/complete': {
    class: 'orgScoped',
  },
  'POST /api/v1/orgs/:orgId/chats/:chatId/attachments/:attachmentId/retry': { class: 'orgScoped' },
  'DELETE /api/v1/orgs/:orgId/chats/:chatId/attachments/:attachmentId': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/chat-folders': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/chat-folders': {
    class: 'orgScoped',
    payload: () => ({ name: 'B folder' }),
  },
  'PUT /api/v1/orgs/:orgId/chat-folders/order': {
    class: 'orgScoped',
    payload: (f) => ({ folderIds: [f.params.folderId] }),
  },
  'PATCH /api/v1/orgs/:orgId/chat-folders/:folderId': {
    class: 'orgScoped',
    payload: () => ({ name: 'Renamed by B' }),
  },
  'DELETE /api/v1/orgs/:orgId/chat-folders/:folderId': { class: 'orgScoped' },
  'PUT /api/v1/chat-uploads/:attachmentId': {
    class: 'public',
    reason: 'Signed upload URL of an attachment; the HMAC signature is the credential',
  },

  // usage (Insights)
  'GET /api/v1/orgs/:orgId/insights/overview': { class: 'orgScoped', query: INSIGHTS_RANGE },
  'GET /api/v1/orgs/:orgId/insights/breakdown': {
    class: 'orgScoped',
    query: { ...INSIGHTS_RANGE, by: 'team' },
  },
  'GET /api/v1/orgs/:orgId/insights/timeseries': {
    class: 'orgScoped',
    query: { ...INSIGHTS_RANGE, interval: 'day' },
  },

  'GET /api/v1/orgs/:orgId/audit/entries': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/audit/entries/:entryId': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/audit/integrity': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/audit/verify': { class: 'orgScoped' },

  // dataControl
  'GET /api/v1/orgs/:orgId/data-requests': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/data-requests': {
    class: 'orgScoped',
    payload: () => ({ type: 'export' }),
  },
  'GET /api/v1/orgs/:orgId/data-requests/:dataRequestId': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/data-requests/:dataRequestId/cancel': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/data-requests/:dataRequestId/retry': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/data-requests/:dataRequestId/download': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/exports': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/exports': {
    class: 'orgScoped',
    payload: () => ({ kind: 'members_csv', params: { version: 1, format: 'csv' } }),
  },
  'GET /api/v1/orgs/:orgId/exports/:exportId': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/exports/:exportId/retry': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/exports/:exportId/download': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/data-control/retention': { class: 'orgScoped' },

  // vault
  'GET /api/v1/orgs/:orgId/vault/providers': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/vault/credentials': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/vault/credentials': {
    class: 'orgScoped',
    payload: (f) => ({
      scope: 'team',
      teamId: f.params.teamId,
      name: 'Intruder key',
      providerKey: 'openai',
      secret: testKey('intruder-key-1234'),
    }),
  },
  'POST /api/v1/orgs/:orgId/vault/connection-tests': {
    class: 'orgScoped',
    payload: () => ({
      kind: 'ai_provider',
      providerKey: 'openai',
      secret: testKey('intruder-key-1234'),
    }),
  },
  'GET /api/v1/orgs/:orgId/vault/credentials/:credentialId': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId/vault/credentials/:credentialId': {
    class: 'orgScoped',
    payload: () => ({ name: 'Renamed by B' }),
  },
  'GET /api/v1/orgs/:orgId/vault/credentials/:credentialId/impact': {
    class: 'orgScoped',
    query: { action: 'revoke' },
  },
  'POST /api/v1/orgs/:orgId/vault/credentials/:credentialId/test': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/vault/credentials/:credentialId/make-primary': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/vault/credentials/:credentialId/revoke': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/vault/local-servers': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/vault/local-servers': {
    class: 'orgScoped',
    payload: (f) => ({
      scope: 'team',
      teamId: f.params.teamId,
      name: 'Intruder server',
      providerKey: 'ollama',
      baseUrl: 'http://ollama.intruder.test:11434',
    }),
  },
  'DELETE /api/v1/orgs/:orgId/vault/local-servers/:serverId': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/vault/local-servers/:serverId/impact': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/vault/local-servers/:serverId/sync': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/vault/my-credentials': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/vault/my-credentials': {
    class: 'orgScoped',
    payload: () => ({
      name: 'Intruder personal',
      providerKey: 'openai',
      secret: testKey('intruder-key-1234'),
    }),
  },
  'GET /api/v1/orgs/:orgId/models': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/vault/models': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/vault/models/:modelId': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId/vault/models/:modelId': {
    class: 'orgScoped',
    payload: () => ({ isEnabled: false }),
  },
  'GET /api/v1/orgs/:orgId/vault/models/:modelId/impact': {
    class: 'orgScoped',
    query: { action: 'disable' },
  },
  'GET /api/v1/orgs/:orgId/vault/models/:modelId/access': { class: 'orgScoped' },
  'PUT /api/v1/orgs/:orgId/vault/models/:modelId/access': {
    class: 'orgScoped',
    payload: (f) => ({ rules: [{ subjectType: 'user', userId: f.params.userId }] }),
  },
  'GET /api/v1/orgs/:orgId/vault/model-access': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/vault/settings': { class: 'orgScoped' },
  'PUT /api/v1/orgs/:orgId/vault/settings': {
    class: 'orgScoped',
    payload: (f) => ({ embeddingModelId: f.params.modelId }),
  },

  // knowledge
  'GET /api/v1/orgs/:orgId/knowledge/summary': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/knowledge/recently-deleted': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/knowledge-bases': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/knowledge-bases': {
    class: 'orgScoped',
    payload: () => ({ name: 'Intruder base' }),
  },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId/knowledge-bases/:baseId': {
    class: 'orgScoped',
    payload: () => ({ name: 'Intruder base' }),
  },
  'DELETE /api/v1/orgs/:orgId/knowledge-bases/:baseId': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/impact': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/restore': {
    class: 'orgScoped',
    payload: () => ({}),
  },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/reindex': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/reindex-impact': { class: 'orgScoped' },
  'PUT /api/v1/orgs/:orgId/knowledge-bases/:baseId/embedding-model': {
    class: 'orgScoped',
    payload: () => ({ modelKey: 'openai/text-embedding-3-small' }),
  },
  'DELETE /api/v1/orgs/:orgId/knowledge-bases/:baseId/embedding-model': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/access': { class: 'orgScoped' },
  'PUT /api/v1/orgs/:orgId/knowledge-bases/:baseId/access': {
    class: 'orgScoped',
    payload: () => ({ grants: [] }),
  },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/access/impact': {
    class: 'orgScoped',
    query: { teamId: '0190a5c4-0000-7000-8000-000000000001' },
  },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/test-search': {
    class: 'orgScoped',
    payload: () => ({ question: 'secret leave policy', includeAnswer: false }),
  },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/files': {
    class: 'orgScoped',
    payload: () => ({
      fileName: 'intruder.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
    }),
  },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/links': {
    class: 'orgScoped',
    payload: () => ({
      url: 'https://intruder.example.test',
      crawlDepth: 0,
      includePaths: [],
      excludePaths: [],
      refresh: 'off',
    }),
  },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/bulk': {
    class: 'orgScoped',
    payload: (f) => ({ action: 'remove', sourceIds: [f.params.sourceId] }),
  },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/:sourceId': { class: 'orgScoped' },
  'PATCH /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/:sourceId': {
    class: 'orgScoped',
    payload: () => ({ name: 'Intruder source' }),
  },
  'DELETE /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/:sourceId': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/:sourceId/complete': {
    class: 'orgScoped',
  },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/:sourceId/retry': {
    class: 'orgScoped',
    payload: () => ({}),
  },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/:sourceId/sync': { class: 'orgScoped' },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/:sourceId/restore': {
    class: 'orgScoped',
  },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/sources/:sourceId/documents': {
    class: 'orgScoped',
  },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/documents/:documentId': { class: 'orgScoped' },
  'GET /api/v1/orgs/:orgId/knowledge-bases/:baseId/documents/:documentId/pages': {
    class: 'orgScoped',
  },
  'POST /api/v1/orgs/:orgId/knowledge-bases/:baseId/documents/:documentId/download': {
    class: 'orgScoped',
  },
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
