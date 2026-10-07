// SPDX-License-Identifier: AGPL-3.0-only

/** Jobs on the `usage` queue (usage-budgets-and-audit.md, "Rollup maintenance"). */
export const USAGE_JOBS = {
  AGGREGATE: 'aggregateUsage',
} as const

/** The watermark trails the run start, for transactions still committing. */
export const ROLLUP_LAG_MS = 5 * 60_000
/** The hourly run starts this far before the watermark: events up to 48 hours late are counted. */
export const HOURLY_LOOKBACK_MS = 48 * 3_600_000
/** The nightly run recomputes this many days: events up to 7 days late are counted. */
export const NIGHTLY_LOOKBACK_DAYS = 7

/**
 * Ranges up to this long ("Today", "7d") and hourly series read `usage_events` with exact
 * boundaries in the caller's time zone; longer ranges read `usage_daily`, whose days are UTC.
 */
export const EVENTS_RANGE_MAX_MS = 8 * 86_400_000

/** Where the last hourly rollup publishes its watermark for Insights' "data through" (global). */
export const USAGE_WATERMARK_CACHE_KEY = 'usage:watermark'
export const USAGE_WATERMARK_TTL_SECONDS = 2 * 86_400
