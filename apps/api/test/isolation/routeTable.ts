// SPDX-License-Identifier: AGPL-3.0-only
import type { HttpMethod } from '../helpers/request.js'
import type { FastifyInstance, RouteOptions } from 'fastify'

/** One registered route of the real app, as the `onRoute` hook saw it. */
export interface RouteTableEntry {
  method: HttpMethod
  /** The full Fastify path, prefix included (`/api/v1/orgs/:orgId/teams`). */
  url: string
  /** `config: { public: true }`: no access guard on purpose. */
  isPublic: boolean
  /** The route has at least one preHandler (the boot check accepts only `defineGuard` ones). */
  guarded: boolean
}

/** `METHOD /path`: the key of every route classification. */
export type RouteKey = `${HttpMethod} ${string}`

export const routeKey = (route: { method: HttpMethod; url: string }): RouteKey =>
  `${route.method} ${route.url}`

const METHODS = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

const recorded = new WeakMap<object, RouteOptions[]>()

type FastifyFactory = (...args: never[]) => FastifyInstance

/**
 * Wraps the `fastify` module so that every instance records its routes from the very first one.
 * `buildApp` registers all routes before it returns, so a hook added afterwards would see none.
 * Use it from a test file with
 * `vi.mock('fastify', async (original) => (await import('./routeTable.js')).recordRoutes(await original()))`.
 */
export function recordRoutes<Module extends { default: unknown }>(module: Module): Module {
  const original = module.default as FastifyFactory
  const factory = (...args: never[]): FastifyInstance => {
    const app = original(...args)
    const routes: RouteOptions[] = []
    recorded.set(app, routes)
    app.addHook('onRoute', (route) => {
      routes.push(route)
    })
    return app
  }
  return Object.assign({}, module, { default: factory, fastify: factory })
}

/**
 * The route table of an app built while `recordRoutes` was in place: one entry per method and
 * path, without the HEAD and OPTIONS routes Fastify adds on its own.
 */
export function routeTableOf(app: FastifyInstance): RouteTableEntry[] {
  const routes = recorded.get(app)
  if (routes === undefined) {
    throw new Error('routeTableOf: the app was not built under recordRoutes (vi.mock fastify)')
  }
  const entries = new Map<RouteKey, RouteTableEntry>()
  for (const route of routes) {
    for (const method of [route.method].flat()) {
      if (!METHODS.has(method)) continue
      const preHandlers = [route.preHandler].flat().filter((handler) => handler !== undefined)
      const entry: RouteTableEntry = {
        method: method as HttpMethod,
        url: route.url,
        isPublic: route.config?.public === true,
        guarded: preHandlers.length > 0,
      }
      entries.set(routeKey(entry), entry)
    }
  }
  return [...entries.values()].sort((a, b) => routeKey(a).localeCompare(routeKey(b)))
}
