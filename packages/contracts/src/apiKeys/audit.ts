// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the apiKeys module writes to the audit log (`<area>.<verb>`, target type `api_key`).
 * The key itself, its hash and its prefix never go into the metadata; `api_key.created` carries
 * the scopes.
 */
export const API_KEY_AUDIT_ACTIONS = {
  API_KEY_CREATED: 'api_key.created',
  API_KEY_UPDATED: 'api_key.updated',
  API_KEY_REVOKED: 'api_key.revoked',
} as const
export type ApiKeyAuditAction = (typeof API_KEY_AUDIT_ACTIONS)[keyof typeof API_KEY_AUDIT_ACTIONS]
