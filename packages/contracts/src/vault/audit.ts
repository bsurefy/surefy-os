// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Actions the vault module writes to the audit log (`<area>.<verb>`, target type `vault_credential`
 * or `vault_model`). Secrets and their last four characters never go into the metadata.
 */
export const VAULT_AUDIT_ACTIONS = {
  VAULT_KEY_ADDED: 'vault_key.added',
  VAULT_KEY_UPDATED: 'vault_key.updated',
  VAULT_KEY_TESTED: 'vault_key.tested',
  VAULT_KEY_SWITCHED: 'vault_key.switched',
  VAULT_KEY_REVOKED: 'vault_key.revoked',
  VAULT_KEY_STATUS_CHANGED: 'vault_key.status_changed',
  VAULT_LOCAL_SERVER_ADDED: 'vault_server.added',
  VAULT_LOCAL_SERVER_REMOVED: 'vault_server.removed',
  VAULT_MODEL_ENABLED: 'vault_model.enabled',
  VAULT_MODEL_DISABLED: 'vault_model.disabled',
  VAULT_MODEL_ACCESS_CHANGED: 'vault_model.access_changed',
  VAULT_SETTINGS_UPDATED: 'vault_settings.updated',
} as const
export type VaultAuditAction = (typeof VAULT_AUDIT_ACTIONS)[keyof typeof VAULT_AUDIT_ACTIONS]
