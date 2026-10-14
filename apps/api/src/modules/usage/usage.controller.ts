// SPDX-License-Identifier: AGPL-3.0-only
import type { BudgetsService } from './budgets.service.js'
import type { InsightsService } from './insights.service.js'
import type {
  getInsightsBudgetMeterRoute,
  getInsightsBreakdownRoute,
  getInsightsOverviewRoute,
  getInsightsRunsOverviewRoute,
  getInsightsRunsTimeseriesRoute,
  getInsightsTimeseriesRoute,
} from './usage.schema.js'
import type { ZodReply, ZodRequest } from '@/types/fastify.js'

type BudgetMeter = typeof getInsightsBudgetMeterRoute
type Overview = typeof getInsightsOverviewRoute
type Breakdown = typeof getInsightsBreakdownRoute
type Timeseries = typeof getInsightsTimeseriesRoute
type RunsOverview = typeof getInsightsRunsOverviewRoute
type RunsTimeseries = typeof getInsightsRunsTimeseriesRoute

export class UsageController {
  constructor(
    private readonly insights: InsightsService,
    private readonly budgets: BudgetsService,
  ) {}

  budgetMeter = async (request: ZodRequest<BudgetMeter>, reply: ZodReply<BudgetMeter>) => {
    reply.ok(await this.budgets.meter(request.tenant, request.query))
  }

  overview = async (request: ZodRequest<Overview>, reply: ZodReply<Overview>) => {
    reply.ok(await this.insights.overview(request.tenant, request.query))
  }

  breakdown = async (request: ZodRequest<Breakdown>, reply: ZodReply<Breakdown>) => {
    reply.ok(await this.insights.breakdown(request.tenant, request.query))
  }

  timeseries = async (request: ZodRequest<Timeseries>, reply: ZodReply<Timeseries>) => {
    reply.ok(await this.insights.timeseries(request.tenant, request.query))
  }

  runsOverview = async (request: ZodRequest<RunsOverview>, reply: ZodReply<RunsOverview>) => {
    reply.ok(await this.insights.runsOverview(request.tenant, request.query))
  }

  runsTimeseries = async (request: ZodRequest<RunsTimeseries>, reply: ZodReply<RunsTimeseries>) => {
    reply.ok(await this.insights.runsTimeseries(request.tenant, request.query))
  }
}
