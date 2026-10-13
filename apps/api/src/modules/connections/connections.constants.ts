// SPDX-License-Identifier: AGPL-3.0-only

/** The connections `maintenance` jobs; their schedulers are in `core/queue/schedulers.ts`. */
export const CONNECTIONS_JOBS = {
  REFRESH: 'connectionsRefresh',
  FLUSH_LAST_USED: 'connectionsFlushLastUsed',
  CLEANUP: 'connectionsCleanup',
} as const

export const TABLE = 'connections'

/** `connections-refresh` runs every 10 minutes and takes OAuth 2 rows expiring within 15. */
export const REFRESH_EVERY_MS = 10 * 60_000
export const REFRESH_WINDOW_MS = 15 * 60_000

/** A token that expires within this window is refreshed before a call uses it. */
export const USE_REFRESH_WINDOW_MS = 60_000

/** Rows one refresh run handles; the next run takes the rest. */
export const REFRESH_BATCH = 200

/** Longest the list's `lastUsedAt` may lag behind a call. */
export const LAST_USED_FLUSH_EVERY_MS = 5 * 60_000

/** Revoked connections stay listed this long, then the cleanup deletes them. */
export const REVOKED_KEEP_MONTHS = 13

/** Rows deleted per cleanup statement, and uses written per flush statement. */
export const CLEANUP_BATCH = 500
export const FLUSH_BATCH = 500

/** The buffer of last uses: one Redis hash, `{orgId}:{connectionId}` → `{ at }` as JSON. */
export const LAST_USED_BUFFER_KEY = 'connections:last-used'

/** A hash that was never flushed (no worker) does not live forever. */
export const LAST_USED_BUFFER_TTL_SECONDS = 24 * 3600

/** One started sign-in: `connections:oauth-state:{state}` → JSON, used once. */
export const OAUTH_STATE_KEY_PREFIX = 'connections:oauth-state:'

/** Random bytes of the `state` value and of the PKCE verifier. */
export const OAUTH_STATE_BYTES = 32

/** The workspace page the provider sends the browser back to (a path of `APP_ORIGIN`). */
export const OAUTH_CALLBACK_PATH = '/settings/connections/callback'

/** Time limits of calls to other apps. */
export const CHECK_TIMEOUT_MS = 10_000
export const TOKEN_TIMEOUT_MS = 15_000

/** Largest answer read from another app. */
export const RESPONSE_MAX_BYTES = 1024 * 1024

/** The shortest token lifetime assumed when a provider names none (seconds). */
export const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600

export const SYSTEM_REASON = 'connection-refresh' as const
