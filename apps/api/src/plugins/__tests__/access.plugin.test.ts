// SPDX-License-Identifier: AGPL-3.0-only
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify'
import fp from 'fastify-plugin'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ERROR_CODES, FEATURES, PERMISSIONS, ROLE_PERMISSIONS } from '@surefy/contracts'

import {
  accessPlugin,
  checkRouteGuards,
  defineGuard,
  type TenantAccessResolver,
} from '../access.plugin.js'
import { errorHandlerPlugin } from '../errorHandler.plugin.js'
import { replyPlugin } from '../reply.plugin.js'

import type { ActorContext, EffectiveAccess } from '@/types/context.js'

const ORG_A = '0199c0de-0000-7000-8000-00000000000a'
const ORG_B = '0199c0de-0000-7000-8000-00000000000b'
const MAYA = '0199c0de-0000-7000-8000-000000000001'

const access = (overrides: Partial<EffectiveAccess> = {}): EffectiveAccess => ({
  role: 'user',
  teamIds: [],
  primaryTeamId: null,
  permissions: [...ROLE_PERMISSIONS.user],
  modules: [],
  features: [],
  readOnlyFeatures: [],
  license: null,
  allowedModelIds: [],
  limits: {
    monthlySpendMicros: null,
    maxAgents: null,
    maxFlows: null,
    maxRunsPerMonth: null,
    maxStorageBytes: null,
    maxKnowledgeBases: null,
  },
  reasons: [],
  ...overrides,
})

const userActor = (app: 'workspace' | 'console' = 'workspace'): ActorContext => ({
  userId: MAYA,
  requestId: 'r1',
  via: 'user',
  session: { id: 's1', app, createdAt: new Date(), expiresAt: new Date() },
})

/** Stands in for the session plugin: `x-actor` carries the actor as JSON. */
const fakeSession = fp(
  (app: FastifyInstance) => {
    app.decorateRequest('auth', null)
    app.addHook('onRequest', (request, _reply, done) => {
      const raw = request.headers['x-actor']
      request.auth = typeof raw === 'string' ? (JSON.parse(raw) as ActorContext) : null
      done()
    })
    return Promise.resolve()
  },
  { name: 'session' },
)

const build = async (memberships: Record<string, EffectiveAccess>) => {
  const tenants: TenantAccessResolver = {
    resolve: (actor, orgId) => Promise.resolve(memberships[`${orgId}:${actor.userId}`] ?? null),
  }
  const app = Fastify()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(errorHandlerPlugin)
  await app.register(replyPlugin)
  await app.register(fakeSession)
  await app.register(accessPlugin, { tenants, guardedPrefix: '/api/v1' })
  await app.register(
    (scope) => {
      const api = scope.withTypeProvider<ZodTypeProvider>()
      const params = z.object({ orgId: z.uuid() })
      api.get('/me', { preHandler: api.authenticate() }, (request, reply) => {
        reply.ok({ userId: request.auth?.userId })
      })
      api.get(
        '/orgs/:orgId/things',
        { schema: { params }, preHandler: api.authorize(PERMISSIONS.NOTIFICATIONS_READ) },
        (request, reply) => {
          reply.ok({ orgId: request.tenant.orgId, role: request.tenant.role })
        },
      )
      api.get(
        '/orgs/:orgId/sso',
        {
          schema: { params },
          preHandler: [
            api.authorize(PERMISSIONS.NOTIFICATIONS_READ),
            api.requireFeature(FEATURES.SSO, { allowReadOnly: true }),
          ],
        },
        (_request, reply) => {
          reply.ok({ fine: true })
        },
      )
      return Promise.resolve()
    },
    { prefix: '/api/v1' },
  )
  await app.ready()
  return app
}

const get = (app: FastifyInstance, url: string, actor?: ActorContext) =>
  app.inject({
    method: 'GET',
    url,
    headers: actor === undefined ? {} : { 'x-actor': JSON.stringify(actor) },
  })

const codeOf = (body: string) => (JSON.parse(body) as { error: { code: string } }).error.code

describe('app.authenticate()', () => {
  it('lets a user session through and refuses no session or an API key', async () => {
    const app = await build({})
    expect((await get(app, '/api/v1/me', userActor())).statusCode).toBe(200)
    const anonymous = await get(app, '/api/v1/me')
    expect([anonymous.statusCode, codeOf(anonymous.body)]).toEqual([
      401,
      ERROR_CODES.AUTH_UNAUTHENTICATED,
    ])
    const key = await get(app, '/api/v1/me', {
      userId: null,
      requestId: 'r',
      via: 'api-key',
      apiKey: { id: 'k', orgId: ORG_A, permissions: [] },
    })
    expect([key.statusCode, codeOf(key.body)]).toEqual([403, ERROR_CODES.ACCESS_FORBIDDEN])
  })
})

describe('app.authorize()', () => {
  it('sets request.tenant for a member with the permission', async () => {
    const app = await build({ [`${ORG_A}:${MAYA}`]: access() })
    const response = await get(app, `/api/v1/orgs/${ORG_A}/things`, userActor())
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: { orgId: ORG_A, role: 'user' } })
  })

  it('answers 401, 404 ORGANIZATION_NOT_FOUND and 403 in that order', async () => {
    const app = await build({
      [`${ORG_A}:${MAYA}`]: access({ permissions: [] }),
    })
    const anonymous = await get(app, `/api/v1/orgs/${ORG_A}/things`)
    expect(anonymous.statusCode).toBe(401)
    const other = await get(app, `/api/v1/orgs/${ORG_B}/things`, userActor())
    expect([other.statusCode, codeOf(other.body)]).toEqual([
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    ])
    const denied = await get(app, `/api/v1/orgs/${ORG_A}/things`, userActor())
    expect([denied.statusCode, codeOf(denied.body)]).toEqual([403, ERROR_CODES.ACCESS_FORBIDDEN])
  })

  it('refuses console sessions on organization routes', async () => {
    const app = await build({ [`${ORG_A}:${MAYA}`]: access() })
    const response = await get(app, `/api/v1/orgs/${ORG_A}/things`, userActor('console'))
    expect([response.statusCode, codeOf(response.body)]).toEqual([
      403,
      ERROR_CODES.ACCESS_FORBIDDEN,
    ])
  })

  it('keeps an API key to its own organization and its scope', async () => {
    const key = (orgId: string, permissions: string[]): ActorContext =>
      ({
        userId: null,
        requestId: 'r',
        via: 'api-key',
        apiKey: { id: 'k', orgId, permissions },
      }) as ActorContext
    const app = await build({ [`${ORG_A}:null`]: access() })
    const foreign = await get(
      app,
      `/api/v1/orgs/${ORG_A}/things`,
      key(ORG_B, [PERMISSIONS.NOTIFICATIONS_READ]),
    )
    expect([foreign.statusCode, codeOf(foreign.body)]).toEqual([
      404,
      ERROR_CODES.ORGANIZATION_NOT_FOUND,
    ])
    const outOfScope = await get(app, `/api/v1/orgs/${ORG_A}/things`, key(ORG_A, []))
    expect(outOfScope.statusCode).toBe(403)
    const allowed = await get(
      app,
      `/api/v1/orgs/${ORG_A}/things`,
      key(ORG_A, [PERMISSIONS.NOTIFICATIONS_READ]),
    )
    expect(allowed.statusCode).toBe(200)
  })
})

describe('app.requireFeature()', () => {
  it('answers 403 FEATURE_NOT_AVAILABLE with the minimum edition', async () => {
    const app = await build({ [`${ORG_A}:${MAYA}`]: access() })
    const response = await get(app, `/api/v1/orgs/${ORG_A}/sso`, userActor())
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({
      error: {
        code: ERROR_CODES.FEATURE_NOT_AVAILABLE,
        details: [{ feature: 'sso', minimumEdition: 'enterprise' }],
      },
    })
  })

  it('passes with the feature, or read-only during grace when allowed', async () => {
    for (const grant of [{ features: [FEATURES.SSO] }, { readOnlyFeatures: [FEATURES.SSO] }]) {
      const app = await build({ [`${ORG_A}:${MAYA}`]: access(grant) })
      expect((await get(app, `/api/v1/orgs/${ORG_A}/sso`, userActor())).statusCode).toBe(200)
    }
  })
})

describe('checkRouteGuards (boot check)', () => {
  const handler = () => Promise.resolve()
  const route = (url: string, options: Partial<RouteOptions> = {}) =>
    ({ method: 'GET', url, handler, ...options }) as RouteOptions
  const guard = (kind: string) => defineGuard(kind, handler)

  it('refuses an unguarded route, an :orgId route without authorize, a lone requireFeature', () => {
    expect(() => {
      checkRouteGuards(route('/api/v1/things'), '/api/v1')
    }).toThrow(/no access guard/)
    expect(() => {
      checkRouteGuards(route('/api/v1/things', { preHandler: [handler] }), '/api/v1')
    }).toThrow(/no access guard/)
    expect(() => {
      checkRouteGuards(
        route('/api/v1/orgs/:orgId/things', { preHandler: guard('authenticate') }),
        '/api/v1',
      )
    }).toThrow(/app.authorize/)
    expect(() => {
      checkRouteGuards(route('/api/v1/orgs/:orgId/things', { config: { public: true } }), '/api/v1')
    }).toThrow(/app.authorize/)
    expect(() => {
      checkRouteGuards(route('/api/v1/things', { preHandler: guard('requireFeature') }), '/api/v1')
    }).toThrow(/must follow/)
  })

  it('accepts guarded and public routes, and ignores routes outside the prefix', () => {
    const ok = [
      route('/api/v1/me', { preHandler: guard('authenticate') }),
      route('/api/v1/orgs/:orgId/x', { preHandler: [guard('authorize'), guard('requireFeature')] }),
      route('/api/v1/auth/options', { config: { public: true } }),
      route('/health/live'),
    ]
    for (const options of ok)
      expect(() => {
        checkRouteGuards(options, '/api/v1')
      }).not.toThrow()
  })
})
