// SPDX-License-Identifier: AGPL-3.0-only

/** The deletion hold before an organization is purged. */
export const DELETION_HOLD_DAYS = 30

/** An export archive or file, and its download link, expire this long after it is ready. */
export const EXPORT_TTL_HOURS = 24

/** Export rows are kept this long, then deleted by the cleanup. */
export const EXPORT_ROW_RETENTION_DAYS = 30

/** Signed download links are short-lived and issued on click, after an access check. */
export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60

/** Cleanup deletes at most this many rows per statement, looping until done. */
export const CLEANUP_BATCH = 5000

/** Retention of the tables the daily cleanup trims (conventions-and-security.md, §9). */
export const RETENTION_DAYS = {
  notifications: 90,
  invitations: 90,
  sessions: 7,
  auditLogs: 365,
  usageEvents: 395,
  deletedItems: 30,
  runSteps: 90,
} as const

/**
 * Monthly partitioned tables and how long their partitions are kept. Tables join this list with
 * their module (run steps 90 days).
 */
export const PARTITIONED_TABLES: readonly { table: string; keep: string }[] = [
  { table: 'audit_logs', keep: '1 year' },
  { table: 'usage_events', keep: '13 months' },
]

/**
 * Soft-delete tables `purge_soft_deleted` empties after the restore window. Chats, prompts,
 * knowledge bases and sources (30 days), agents and flows (90 days) join with their modules,
 * together with the function itself.
 */
export const SOFT_DELETE_TABLES: readonly { table: string; windowDays: number }[] = []

/** Months of partitions prepared ahead of time. */
export const PARTITION_MONTHS_AHEAD = 3

export const DATA_CONTROL_JOBS = {
  PREPARE_DATA_EXPORT: 'prepareDataExport',
  PREPARE_EXPORT: 'prepareExport',
  PURGE_ORGANIZATION: 'purgeOrganization',
  CLEANUP: 'cleanupExpired',
  ENSURE_PARTITIONS: 'ensurePartitions',
  PURGE_SOFT_DELETED: 'purgeSoftDeleted',
  SCHEDULE_PURGES: 'scheduleOrganizationPurges',
} as const

/** Error codes recorded on a failed export or purge (shown with "Try again", or to Cloud staff). */
export const EXPORT_FAILED_CODE = 'EXPORT_FAILED'
export const PURGE_ERROR_CODES = {
  LEGAL_HOLD: 'PURGE_LEGAL_HOLD',
  STORAGE_FAILED: 'PURGE_STORAGE_FAILED',
  DB_FAILED: 'PURGE_DB_FAILED',
} as const
