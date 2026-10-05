// SPDX-License-Identifier: AGPL-3.0-only
import { PERMISSIONS } from '@surefy/contracts'

import {
  getInsightsBreakdownRoute,
  getInsightsOverviewRoute,
  getInsightsTimeseriesRoute,
} from './usage.schema.js'

import type { UsageController } from './usage.controller.js'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export function usageRoutes(controller: UsageController): FastifyPluginAsyncZod {
  return (app) => {
    const read = app.authorize(PERMISSIONS.INSIGHTS_READ)
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
    return Promise.resolve()
  }
}
