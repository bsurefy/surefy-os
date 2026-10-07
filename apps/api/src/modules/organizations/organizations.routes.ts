// SPDX-License-Identifier: AGPL-3.0-only
import { RATE_LIMITS } from '@/constants/rateLimits.js'
import { PERMISSIONS } from '@surefy/contracts'

import {
  createOrganizationRoute,
  getOrganizationRoute,
  slugAvailabilityRoute,
  updateOrganizationRoute,
} from './organizations.schema.js'

import type { OrganizationsController } from './organizations.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function organizationsRoutes(controller: OrganizationsController): FastifyPluginAsyncZod {
  return (app) => {
    // Every member reads the organization they are in (the contracts have no narrower key).
    app.get(
      '/orgs/:orgId',
      { schema: getOrganizationRoute, preHandler: app.authorize(PERMISSIONS.MEMBERS_MANAGE_SELF) },
      controller.get,
    )
    app.patch(
      '/orgs/:orgId',
      { schema: updateOrganizationRoute, preHandler: app.authorize(PERMISSIONS.SETTINGS_MANAGE) },
      controller.update,
    )
    app.post(
      '/organizations',
      { schema: createOrganizationRoute, preHandler: app.authenticate() },
      controller.create,
    )
    app.get(
      '/organizations/slug-availability',
      {
        schema: slugAvailabilityRoute,
        config: { public: true, rateLimit: RATE_LIMITS.publicLookup },
      },
      controller.slugAvailability,
    )
    return Promise.resolve()
  }
}
