// SPDX-License-Identifier: AGPL-3.0-only
import Fastify, {
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import { accessPlugin } from './plugins/access.plugin.js'
import { errorHandlerPlugin } from './plugins/errorHandler.plugin.js'
import { healthPlugin } from './plugins/health.plugin.js'
import { openapiPlugin } from './plugins/openapi.plugin.js'
import { rateLimitPlugin } from './plugins/rateLimit.plugin.js'
import { replyPlugin } from './plugins/reply.plugin.js'
import { generateRequestId, requestContextPlugin } from './plugins/requestContext.plugin.js'
import { securityPlugin } from './plugins/security.plugin.js'
import { sessionPlugin } from './plugins/session.plugin.js'

import type { Container } from './container.js'
import type { Config } from './core/config/index.js'

/** JSON bodies above this need an explicit per-route `bodyLimit` (api.md, §7). */
export const DEFAULT_BODY_LIMIT = 1_048_576

export const API_PREFIX = '/api/v1'

/* eslint-disable sonarjs/function-return-type -- Fastify's option is a union by design */
/** Fastify's `trustProxy`: a hop count becomes the function Fastify's types expect. */
export const toTrustProxy = (
  value: Config['server']['trustProxy'],
): boolean | string | string[] | ((address: string, hop: number) => boolean) => {
  if (typeof value === 'number') return (_address, hop) => hop < value
  if (typeof value === 'object') return [...value]
  return value
}
/* eslint-enable sonarjs/function-return-type */

/**
 * Builds the Fastify instance from the container: plugins in their fixed order
 * (folder-structure.md, §3), then the module routes and the extension routes under /api/v1.
 */
export async function buildApp(container: Container): Promise<FastifyInstance> {
  const { config } = container
  // The explicit type arguments keep the instance on Fastify's default logger type, so plugins
  // typed against FastifyInstance register without friction.
  const app = Fastify<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression>({
    loggerInstance: container.logger,
    disableRequestLogging: true, // the requestContext plugin writes the one line per request
    requestIdHeader: false,
    genReqId: (request) => generateRequestId(request.headers),
    trustProxy: toTrustProxy(config.server.trustProxy),
    bodyLimit: DEFAULT_BODY_LIMIT,
  })

  // Both compilers are set before any route is registered.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(requestContextPlugin)
  await app.register(securityPlugin, { config })
  await app.register(rateLimitPlugin, { redis: container.cache.client })
  await app.register(errorHandlerPlugin)
  await app.register(replyPlugin)
  await app.register(sessionPlugin, { config, auth: container.auth })
  await app.register(accessPlugin, { tenants: container.tenants, guardedPrefix: API_PREFIX })
  await app.register(openapiPlugin, { config })
  await app.register(healthPlugin, {
    checks: { database: () => container.db.ping(), redis: () => container.cache.ping() },
    extensions: () => container.extensions.names,
  })

  await app.register(
    async (scope) => {
      const api = scope.withTypeProvider<ZodTypeProvider>()
      // Module routes register here, one line each, in dependency order.
      await api.register(container.modules.auth.routes)
      await api.register(container.modules.notifications.routes)
      await api.register(container.modules.organizations.routes)
      await api.register(container.modules.teams.routes)
      await api.register(container.modules.members.routes)
      for (const routes of container.extensions.routes) await api.register(routes)
    },
    { prefix: API_PREFIX },
  )

  return app
}
