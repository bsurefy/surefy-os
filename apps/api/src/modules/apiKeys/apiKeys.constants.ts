// SPDX-License-Identifier: AGPL-3.0-only
export const API_KEYS_JOBS = {
  FLUSH_LAST_USED: 'apiKeysFlushLastUsed',
  CLEANUP: 'apiKeysCleanup',
} as const

/** Longest the list's `lastUsedAt` may lag behind a call. */
export const LAST_USED_FLUSH_EVERY_MS = 5 * 60_000

/** Revoked keys stay listed this long, then the cleanup deletes them. */
export const REVOKED_KEEP_MONTHS = 13

/** Rows deleted per cleanup statement. */
export const CLEANUP_BATCH = 500

/** Entries one flush writes per statement. */
export const FLUSH_BATCH = 500

/** The buffer of last uses: one Redis hash, `{orgId}:{keyId}` → `{ at, ip }` as JSON. */
export const LAST_USED_BUFFER_KEY = 'api-keys:last-used'

/** A hash that was never flushed (no worker) does not live forever. */
export const LAST_USED_BUFFER_TTL_SECONDS = 24 * 3600

export const SYSTEM_REASON = 'maintenance' as const
