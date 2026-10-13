// SPDX-License-Identifier: AGPL-3.0-only
import { orgKey } from '@/core/cache/index.js'

/** The Guard `maintenance` jobs; their schedulers are in `core/queue/schedulers.ts`. */
export const GUARD_JOBS = {
  STATS_ROLLUP: 'guardStatsRollup',
} as const

/** `guard-stats-hourly` rebuilds today and yesterday; `guard-stats-nightly` the last week. */
export const STATS_HOURLY_DAYS = 2
export const STATS_NIGHTLY_DAYS = 7

/** The system scope reason of the statistics rollup. */
export const STATS_REASON = 'guard-stats' as const

/** The cached rule set is also dropped by `guard.rules_changed`; the TTL only bounds a missed event. */
export const RULES_CACHE_TTL_SECONDS = 300

/** `org:{orgId}:guard:rules`, deleted by every write to the settings, guardrails or data filters. */
export const rulesCacheKey = (orgId: string): string => orgKey(orgId, 'guard', 'rules')

/** `org:{orgId}:guard:limit:{ruleRef}:{yyyymmdd}` (count) and `…:amount` (sum of amounts). */
export const limitCounterKey = (orgId: string, ruleRef: string, day: string): string =>
  orgKey(orgId, 'guard', 'limit', ruleRef, day)

/** A day's counters outlive the day by a margin, so a check just after midnight still reads them. */
export const LIMIT_COUNTER_TTL_SECONDS = 2 * 86_400

/** "Triggered this week". */
export const TRIGGERED_WINDOW_DAYS = 7

/** The most rule rows the Guardrails table lists; an organization has a handful. */
export const GUARDRAILS_LISTED_MAX = 1000

/** A nil id, the cursor tail of the in-memory pages. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** The longest text the "Try it" box and the filter send to the ML service per call. */
export const PII_BATCH_MAX_TEXTS = 100

/** Largest run of repeated characters in a custom pattern's quantifier, a guard against blow-ups. */
export const PII_PATTERN_MAX_REPEAT = 1000

/** The confidence samples the impact preview reads. */
export const IMPACT_SAMPLE_LIMIT = 1000
