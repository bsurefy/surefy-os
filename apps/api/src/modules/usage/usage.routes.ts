// SPDX-License-Identifier: AGPL-3.0-only
import { ForbiddenError } from '@/core/errors/index.js'
import { defineGuard } from '@/plugins/access.plugin.js'
import { PERMISSIONS } from '@surefy/contracts'

import {
  getInsightsBreakdownRoute,
  getInsightsOverviewRoute,
  getInsightsRunsOverviewRoute,
  getInsightsRunsTimeseriesRoute,
  getInsightsTimeseriesRoute,
} from './usage.schema.js'

import type { UsageController } from './usage.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

/**
 * Insights routes. `insights:read` reads the organization; without it, `insights:read-own`
 * (Builders) reads the agents the person can edit, and the service narrows every number to them.
 */
export function usageRoutes(controller: UsageController): FastifyPluginAsyncZod {
  return (app) => {
    const all = app.authorize(PERMISSIONS.INSIGHTS_READ)
    const own = app.authorize(PERMISSIONS.INSIGHTS_READ_OWN)
    const read = defineGuard('authorize', async function (request, reply) {
      try {
        await all.call(this, request, reply)
      } catch (error) {
        if (!(error instanceof ForbiddenError)) throw error
        await own.call(this, request, reply)
      }
    })
    app.get(
      '/orgs/:orgId/insights/overview',
      { schema: getInsightsOverviewRoute, preHandler: read },
      controller.overview,
    )
    app.get(
      '/orgs/:orgId/insights/breakdown',
      { schema: getInsightsBreakdownRoute, preHandler: read },
      controller.breakdown,
    )
    app.get(
      '/orgs/:orgId/insights/timeseries',
      { schema: getInsightsTimeseriesRoute, preHandler: read },
      controller.timeseries,
    )
    app.get(
      '/orgs/:orgId/insights/runs-overview',
      { schema: getInsightsRunsOverviewRoute, preHandler: read },
      controller.runsOverview,
    )
    app.get(
      '/orgs/:orgId/insights/runs-timeseries',
      { schema: getInsightsRunsTimeseriesRoute, preHandler: read },
      controller.runsTimeseries,
    )
    return Promise.resolve()
  }
}
