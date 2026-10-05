// SPDX-License-Identifier: AGPL-3.0-only
import {
  insightsBreakdownDtoSchema,
  insightsBreakdownQuerySchema,
  insightsOverviewDtoSchema,
  insightsOverviewQuerySchema,
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
  summary: 'Cost and tokens by team, person or model',
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
