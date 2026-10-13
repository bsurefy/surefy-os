// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the connections module writes to the audit log (`<area>.<verb>`, target type
 * `connection`). Secrets, tokens and their last four characters never go into the metadata.
 */
export const CONNECTION_AUDIT_ACTIONS = {
  CONNECTION_CREATED: 'connection.created',
  CONNECTION_RECONNECTED: 'connection.reconnected',
  CONNECTION_REVOKED: 'connection.revoked',
  /** Written by the system actor when a token can no longer be refreshed. */
  CONNECTION_EXPIRED: 'connection.expired',
} as const
export type ConnectionAuditAction =
  (typeof CONNECTION_AUDIT_ACTIONS)[keyof typeof CONNECTION_AUDIT_ACTIONS]
