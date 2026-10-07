// SPDX-License-Identifier: AGPL-3.0-only

/** Rows `audit_seal` seals per organization and run (every minute). */
export const AUDIT_SEAL_LIMIT = 5000

/** Sealed rows the verification reads per transaction while it walks a chain. */
export const AUDIT_VERIFY_BATCH = 1000

/** The chain's starting hash: 32 zero bytes. */
export const AUDIT_ZERO_HASH = Buffer.alloc(32)

/** The last verification result is kept this long; the nightly run refreshes it. */
export const AUDIT_INTEGRITY_TTL_SECONDS = 8 * 24 * 60 * 60

export const SEAL_AUDIT_LOG_JOB_NAME = 'sealAuditLog'
export const VERIFY_AUDIT_LOG_JOB_NAME = 'verifyAuditLog'

/** BullMQ job id of an organization's on-demand verification (one at a time). */
export const verifyJobId = (orgId: string): string => `audit-verify-${orgId}`
