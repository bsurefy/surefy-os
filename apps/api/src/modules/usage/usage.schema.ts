// SPDX-License-Identifier: AGPL-3.0-only
import {
  insightsBreakdownDtoSchema,
  insightsBreakdownQuerySchema,
  insightsOverviewDtoSchema,
  insightsOverviewQuerySchema,
  insightsRunsOverviewDtoSchema,
  insightsRunsQuerySchema,
  insightsRunsTimeseriesDtoSchema,
  insightsRunsTimeseriesQuerySchema,
  insightsTimeseriesDtoSchema,
  insightsTimeseriesQuerySchema,
  okResponse,
  orgParamsSchema,
} from '@surefy/contracts'

const TAGS = ['insights']

export const getInsightsOverviewRoute = {
  tags: TAGS,
  summary: 'Usage and cost KPIs for a range and filters',
  params: orgParamsSchema,
  querystring: insightsOverviewQuerySchema,
  response: { 200: okResponse(insightsOverviewDtoSchema) },
}

export const getInsightsBreakdownRoute = {
  tags: TAGS,
  summary: 'Cost and tokens by team, person, model or agent',
  params: orgParamsSchema,
  querystring: insightsBreakdownQuerySchema,
  response: { 200: okResponse(insightsBreakdownDtoSchema) },
}

export const getInsightsTimeseriesRoute = {
  tags: TAGS,
  summary: 'Tokens and cost over time',
  params: orgParamsSchema,
  querystring: insightsTimeseriesQuerySchema,
  response: { 200: okResponse(insightsTimeseriesDtoSchema) },
}

export const getInsightsRunsOverviewRoute = {
  tags: TAGS,
  summary: 'Runs, success rate, average duration and approvals for a range',
  params: orgParamsSchema,
  querystring: insightsRunsQuerySchema,
  response: { 200: okResponse(insightsRunsOverviewDtoSchema) },
}

export const getInsightsRunsTimeseriesRoute = {
  tags: TAGS,
  summary: 'Finished runs over time by outcome',
  params: orgParamsSchema,
  querystring: insightsRunsTimeseriesQuerySchema,
  response: { 200: okResponse(insightsRunsTimeseriesDtoSchema) },
}
