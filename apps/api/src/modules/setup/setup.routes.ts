// SPDX-License-Identifier: AGPL-3.0-only
import { RATE_LIMITS } from '@/constants/rateLimits.js'
import { PERMISSIONS } from '@surefy/contracts'

import {
  completeSetupRoute,
  runSetupRoute,
  setupChecklistRoute,
  setupStatusRoute,
} from './setup.schema.js'

import type { SetupController } from './setup.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function setupRoutes(controller: SetupController): FastifyPluginAsyncZod {
  return (app) => {
    // Public before the first account exists; POST /setup closes once an organization exists.
    app.get(
      '/setup/status',
      { schema: setupStatusRoute, config: { public: true, rateLimit: RATE_LIMITS.publicLookup } },
      controller.status,
    )
    app.post(
      '/setup',
      { schema: runSetupRoute, config: { public: true, rateLimit: RATE_LIMITS.auth } },
      controller.run,
    )
    app.post(
      '/orgs/:orgId/setup/complete',
      { schema: completeSetupRoute, preHandler: app.authorize(PERMISSIONS.SETTINGS_MANAGE) },
      controller.complete,
    )
    // Every member sees the checklist; it reads their own dismissal.
    app.get(
      '/orgs/:orgId/setup/checklist',
      { schema: setupChecklistRoute, preHandler: app.authorize(PERMISSIONS.MEMBERS_MANAGE_SELF) },
      controller.checklist,
    )
    return Promise.resolve()
  }
}
