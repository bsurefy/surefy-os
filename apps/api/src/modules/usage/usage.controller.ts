// SPDX-License-Identifier: AGPL-3.0-only
import type { InsightsService } from './insights.service.js'
import type {
  getInsightsBreakdownRoute,
  getInsightsOverviewRoute,
  getInsightsTimeseriesRoute,
} from './usage.schema.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type Overview = typeof getInsightsOverviewRoute
type Breakdown = typeof getInsightsBreakdownRoute
type Timeseries = typeof getInsightsTimeseriesRoute

export class UsageController {
  constructor(private readonly insights: InsightsService) {}

  overview = async (request: ZodRequest<Overview>, reply: ZodReply<Overview>) => {
    reply.ok(await this.insights.overview(request.tenant, request.query))
  }

  breakdown = async (request: ZodRequest<Breakdown>, reply: ZodReply<Breakdown>) => {
    reply.ok(await this.insights.breakdown(request.tenant, request.query))
  }

  timeseries = async (request: ZodRequest<Timeseries>, reply: ZodReply<Timeseries>) => {
    reply.ok(await this.insights.timeseries(request.tenant, request.query))
  }
}
