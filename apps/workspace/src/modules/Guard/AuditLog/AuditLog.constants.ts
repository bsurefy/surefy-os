// SPDX-License-Identifier: AGPL-3.0-only
import type { AuditOutcome } from '@surefy/contracts'
import type { StatusTone } from '@surefy/ui/components/DataDisplay'

/** The date range filter's presets; `all` sets no bound. */
export const AUDIT_DATE_RANGES = ['24h', '7d', '30d', '90d', 'all'] as const
export type AuditDateRange = (typeof AUDIT_DATE_RANGES)[number]

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export const AUDIT_DATE_RANGE_MS: Record<Exclude<AuditDateRange, 'all'>, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
}

/** The "any" choice of a single-value filter; never sent to the API. */
export const ANY = 'any'

export const OUTCOME_TONE: Record<AuditOutcome, StatusTone> = {
  success: 'success',
  denied: 'warning',
  failed: 'destructive',
}

export const AUDIT_EXPORT_FORMATS = ['csv', 'json'] as const
export type AuditExportFormat = (typeof AUDIT_EXPORT_FORMATS)[number]

/** Audit times keep the seconds: entries a few seconds apart must read in order. */
export const AUDIT_TIME_FORMAT = { dateStyle: 'medium', timeStyle: 'medium' } as const
