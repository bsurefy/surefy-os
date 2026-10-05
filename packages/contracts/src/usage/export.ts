// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { insightsFiltersSchema } from './insights.js'

import type { ExportParams } from '../dataControl/schemas.js'

// The Insights CSV export: `POST /api/v1/orgs/:orgId/exports` with kind `usage_csv`
// (dataControl). `params.dateRange` carries the Insights range and time zone, `params.filters` the
// Insights filters, `params.columns` a subset of `USAGE_CSV_COLUMNS`. One row per UTC day, team,
// person, source and model (the `usage_daily` grain); private chats contribute numbers only.

export const USAGE_CSV_COLUMNS = [
  'day',
  'team',
  'person',
  'email',
  'source',
  'model',
  'provider',
  'billedVia',
  'requests',
  'errors',
  'inputTokens',
  'outputTokens',
  'cachedInputTokens',
  'reasoningTokens',
  'cost',
  'currency',
] as const
export type UsageCsvColumn = (typeof USAGE_CSV_COLUMNS)[number]

/** Columns that name a person; an export with any of them shows the personal-data notice. */
export const USAGE_CSV_PERSONAL_COLUMNS = ['person', 'email'] as const satisfies UsageCsvColumn[]

/** The shape of `params.filters` for `usage_csv`; the same keys as the Insights query. */
export const usageExportFiltersSchema = insightsFiltersSchema
export type UsageExportFilters = z.infer<typeof usageExportFiltersSchema>

export const usageCsvColumnsSchema = z.array(z.enum(USAGE_CSV_COLUMNS)).min(1)

/** True when the export would name people: no column list means every column. */
export const usageExportContainsPersonalData = (params: Pick<ExportParams, 'columns'>) =>
  (params.columns ?? USAGE_CSV_COLUMNS).some((column) =>
    (USAGE_CSV_PERSONAL_COLUMNS as readonly string[]).includes(column),
  )
