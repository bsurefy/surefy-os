// SPDX-License-Identifier: AGPL-3.0-only
import fp from 'fastify-plugin'

import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/core/errors/index.js'
import { ERROR_CODES, FEATURE_EDITIONS, type Feature, type Permission } from '@surefy/contracts'

import type { ActorContext, EffectiveAccess, TenantContext } from '@/types/context.js'
import type { RequireFeatureOptions } from '@/types/fastify.js'
import type { FastifyRequest, preHandlerAsyncHookHandler, RouteOptions } from 'fastify'

/**
 * Membership and effective access of an actor in an organization: null when the actor has no
 * access there (no active membership, no access grant, another organization's API key), which
 * answers `404 ORGANIZATION_NOT_FOUND`. The access module provides it; it may also throw the
 * organization's own rules (suspended organization, required two-factor).
 */
export interface TenantAccessResolver {
  resolve(actor: ActorContext, orgId: string): Promise<EffectiveAccess | null>
}

/** Until the access module is wired, nobody has access to any organization. */
export const NO_TENANT_ACCESS: TenantAccessResolver = { resolve: () => Promise.resolve(null) }

export interface AccessPluginOptions {
  tenants: TenantAccessResolver
  /** Routes under this prefix must have a guard or `config: { public: true }` (`/api/v1`). */
  guardedPrefix: string
}

/** The preHandlers made with `defineGuard` and their kind; the boot check recognizes only these. */
const guardKinds = new WeakMap<object, string>()

/**
 * Marks a preHandler as an access guard named `kind` (`authenticate`, `authorize`,
 * `requireFeature`, or an extension's own, such as `authorizePlatform`).
 */
export function defineGuard(
  kind: string,
  handler: preHandlerAsyncHookHandler,
): preHandlerAsyncHookHandler {
  const guard: preHandlerAsyncHookHandler = function (this, request, reply) {
    return handler.call(this, request, reply)
  }
  guardKinds.set(guard, kind)
  return guard
}

const guardKind = (handler: unknown): string | undefined =>
  typeof handler === 'function' ? guardKinds.get(handler) : undefined

const toList = (value: unknown): unknown[] => {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * The boot check (authorization.md, §3): a route under the guarded prefix needs a guard or an
 * explicit `public: true`, a route with `:orgId` needs `authorize()`, and `requireFeature()` only
 * follows `authorize()`.
 */
export function checkRouteGuards(route: RouteOptions, guardedPrefix: string): void {
  if (!route.url.startsWith(`${guardedPrefix}/`)) return
  const name = `${String(route.method)} ${route.url}`
  const kinds = toList(route.preHandler).map(guardKind)
  const isPublic = route.config?.public === true
  if (route.url.includes(':orgId') && !kinds.includes('authorize')) {
    throw new Error(`${name}: routes with :orgId must use app.authorize()`)
  }
  if (kinds.includes('requireFeature') && !kinds.includes('authorize')) {
    throw new Error(`${name}: app.requireFeature() must follow app.authorize()`)
  }
  if (!isPublic && kinds.every((kind) => kind === undefined)) {
    throw new Error(`${name}: no access guard and no config: { public: true }`)
  }
}

class OrganizationNotFoundError extends NotFoundError {
  constructor() {
    super(ERROR_CODES.ORGANIZATION_NOT_FOUND, 'Organization not found')
  }
}

const orgIdOf = (request: FastifyRequest): string => {
  const { orgId } = request.params as { orgId?: unknown }
  if (typeof orgId !== 'string') throw new Error('app.authorize() on a route without :orgId')
  return orgId
}

/**
 * The route guards (authorization.md, §3; multi-tenancy.md, §2). Runs after the session plugin, so
 * `request.auth` is known; every guard is a preHandler made with `defineGuard`.
 */
export const accessPlugin = fp<AccessPluginOptions>(
  (app, { tenants, guardedPrefix }) => {
    // Null until app.authorize() sets it; the boot check guarantees that for every :orgId route.
    app.decorateRequest('tenant', null as unknown as TenantContext)

    app.addHook('onRoute', (route) => {
      checkRouteGuards(route, guardedPrefix)
    })

    app.decorate('authenticate', () =>
      defineGuard('authenticate', (request) => {
        const actor = request.auth
        if (actor === null) return Promise.reject(new UnauthorizedError())
        if (actor.via !== 'user' || actor.session === undefined) {
          return Promise.reject(
            new ForbiddenError(ERROR_CODES.ACCESS_FORBIDDEN, 'A user session is required'),
          )
        }
        return Promise.resolve()
      }),
    )

    app.decorate('authorize', (permission: Permission) =>
      defineGuard('authorize', async (request) => {
        const actor = request.auth
        if (actor === null) throw new UnauthorizedError()
        // App rules (authentication.md, §7): organization routes take workspace sessions only.
        if (actor.session !== undefined && actor.session.app !== 'workspace') {
          throw new ForbiddenError(ERROR_CODES.ACCESS_FORBIDDEN, 'Not available from this app')
        }
        const orgId = orgIdOf(request)
        if (actor.apiKey !== undefined && actor.apiKey.orgId !== orgId) {
          throw new OrganizationNotFoundError()
        }
        const access = await tenants.resolve(actor, orgId)
        if (access === null) throw new OrganizationNotFoundError()
        const keyAllows =
          actor.apiKey === undefined || actor.apiKey.permissions.includes(permission)
        if (!access.permissions.includes(permission) || !keyAllows) {
          throw new ForbiddenError(ERROR_CODES.ACCESS_FORBIDDEN, 'Access forbidden', {
            meta: { permission },
          })
        }
        request.tenant = { ...actor, orgId, role: access.role, teamIds: access.teamIds, access }
        request.log = request.log.child({ orgId })
      }),
    )

    app.decorate('requireFeature', (feature: Feature, options: RequireFeatureOptions = {}) =>
      defineGuard('requireFeature', (request) => {
        const { features, readOnlyFeatures } = request.tenant.access
        const available =
          features.includes(feature) ||
          (options.allowReadOnly === true && readOnlyFeatures.includes(feature))
        if (available) return Promise.resolve()
        return Promise.reject(
          new ForbiddenError(ERROR_CODES.FEATURE_NOT_AVAILABLE, 'Feature not available', {
            details: [{ feature, minimumEdition: FEATURE_EDITIONS[feature].minimum }],
          }),
        )
      }),
    )
    return Promise.resolve()
  },
  { name: 'access', dependencies: ['session'] },
)
