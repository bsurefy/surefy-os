// SPDX-License-Identifier: AGPL-3.0-only
import {
  getMeRoute,
  listSessionsRoute,
  revokeOtherSessionsRoute,
  revokeSessionRoute,
  signInOptionsRoute,
  updateMeRoute,
} from './auth.schema.js'

import type { AuthController } from './auth.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function authRoutes(controller: AuthController): FastifyPluginAsyncZod {
  return (app) => {
    const preHandler = app.authenticate()
    app.get('/me', { schema: getMeRoute, preHandler }, controller.me)
    app.patch('/me', { schema: updateMeRoute, preHandler }, controller.updateMe)
    app.get('/me/sessions', { schema: listSessionsRoute, preHandler }, controller.listSessions)
    app.post(
      '/me/sessions/revoke-others',
      { schema: revokeOtherSessionsRoute, preHandler },
      controller.revokeOtherSessions,
    )
    app.delete(
      '/me/sessions/:sessionId',
      { schema: revokeSessionRoute, preHandler },
      controller.revokeSession,
    )
    app.get(
      '/auth/options',
      { schema: signInOptionsRoute, config: { public: true } },
      controller.signInOptions,
    )
    return Promise.resolve()
  }
}
