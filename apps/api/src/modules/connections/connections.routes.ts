// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  completeOauthRoute,
  connectionImpactRoute,
  createConnectionRoute,
  getConnectionRoute,
  listConnectionsRoute,
  listProvidersRoute,
  reconnectConnectionRoute,
  revokeConnectionRoute,
  startOauthRoute,
  testConnectionRoute,
  updateConnectionRoute,
} from './connections.schema.js'

import type { ConnectionsController } from './connections.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Connections routes (design/workspace/connections.md, §8). Builders reach all of them for their
 * own personal connections; what an Admin or Owner may add beyond that (team and organization
 * connections, other people's connections) is decided by the service from `connections:manage`.
 */
export function connectionsRoutes(c: ConnectionsController): FastifyPluginAsyncZod {
  return (app) => {
    const use = app.authorize(PERMISSIONS.CONNECTIONS_USE)
    const base = '/orgs/:orgId/connections'
    const one = `${base}/:connectionId`

    app.get(`${base}/providers`, { schema: listProvidersRoute, preHandler: use }, c.providers)
    app.get(base, { schema: listConnectionsRoute, preHandler: use }, c.list)
    app.post(base, { schema: createConnectionRoute, preHandler: use }, c.create)
    app.post(`${base}/oauth/start`, { schema: startOauthRoute, preHandler: use }, c.startOauth)
    app.post(
      `${base}/oauth/complete`,
      { schema: completeOauthRoute, preHandler: use },
      c.completeOauth,
    )
    app.get(one, { schema: getConnectionRoute, preHandler: use }, c.get)
    app.patch(one, { schema: updateConnectionRoute, preHandler: use }, c.update)
    app.get(`${one}/impact`, { schema: connectionImpactRoute, preHandler: use }, c.impact)
    app.post(`${one}/reconnect`, { schema: reconnectConnectionRoute, preHandler: use }, c.reconnect)
    app.post(`${one}/test`, { schema: testConnectionRoute, preHandler: use }, c.test)
    app.post(`${one}/revoke`, { schema: revokeConnectionRoute, preHandler: use }, c.revoke)
    return Promise.resolve()
  }
}
