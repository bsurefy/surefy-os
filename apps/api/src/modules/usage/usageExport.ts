// SPDX-License-Identifier: AGPL-3.0-only
import {
  PERMISSIONS,
  USAGE_CSV_COLUMNS,
  usageCsvColumnsSchema,
  usageExportFiltersSchema,
  type UsageCsvColumn,
} from '@surefy/contracts'

import { microsToAmount, utcDayRange } from './usage.utils.js'

import type { UsageCsvRow, UsageRepository } from './usage.repository.js'
import type { ExportProducer } from '@/modules/dataControl/index.js'

const CELL: Record<UsageCsvColumn, (row: UsageCsvRow) => unknown> = {
  day: (row) => row.day,
  team: (row) => row.team,
  person: (row) => row.person,
  email: (row) => row.email,
  source: (row) => row.source,
  model: (row) => row.model,
  provider: (row) => row.provider,
  billedVia: (row) => row.billedVia,
  requests: (row) => row.requests,
  errors: (row) => row.errors,
  inputTokens: (row) => row.inputTokens,
  outputTokens: (row) => row.outputTokens,
  cachedInputTokens: (row) => row.cachedInputTokens,
  reasoningTokens: (row) => row.reasoningTokens,
  cost: (row) => microsToAmount(row.costMicros),
  currency: (row) => row.currency,
}

/**
 * Insights › Overview export (`usage_csv`): one row per UTC day, team, person, source and model
 * from the daily rollup, for the export's date range and Insights filters. It names people unless
 * the requester left out the person and email columns.
 */
export function createUsageCsvProducer(repository: UsageRepository): ExportProducer {
  return {
    kind: 'usage_csv',
    permission: PERMISSIONS.INSIGHTS_READ,
    containsPersonalData: true,
    baseName: (now) => `usage-${now.toISOString().slice(0, 10)}`,
    async produce(tx, { orgId, params }) {
      const filters = usageExportFiltersSchema.parse(params.filters)
      const columns =
        params.columns === undefined
          ? [...USAGE_CSV_COLUMNS]
          : usageCsvColumnsSchema.parse(params.columns)
      const days =
        params.dateRange === undefined
          ? null
          : utcDayRange(params.dateRange.from, params.dateRange.to)
      const rows = await repository.csvRows(tx, orgId, days, filters)
      return { columns, rows: rows.map((row) => columns.map((column) => CELL[column](row))) }
    },
  }
}
