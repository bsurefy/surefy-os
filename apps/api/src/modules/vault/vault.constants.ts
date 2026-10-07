// SPDX-License-Identifier: AGPL-3.0-only

/** The vault's `maintenance` jobs; their schedulers are in `core/queue/schedulers.ts`. */
export const VAULT_JOBS = {
  EXPIRE_KEYS: 'vaultExpireKeys',
  SYNC_MODELS: 'vaultSyncModels',
  CHECK_SERVERS: 'vaultCheckServers',
  ROTATE_KEYS: 'vaultRotateKeys',
} as const

/** Data key rotation: re-encrypted rows per transaction. */
export const REENCRYPT_BATCH = 200

/** The audit entries of the three key operations (vault-and-models.md, §1). */
export const KEY_AUDIT_ACTIONS = {
  ROTATED: 'organization_key.rotated',
  REWRAPPED: 'organization_key.rewrapped',
  DELETED: 'organization_key.deleted',
} as const
