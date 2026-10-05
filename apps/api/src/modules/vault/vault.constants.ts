// SPDX-License-Identifier: AGPL-3.0-only

/** The vault's `maintenance` jobs; their schedulers are in `core/queue/schedulers.ts`. */
export const VAULT_JOBS = {
  EXPIRE_KEYS: 'vaultExpireKeys',
  SYNC_MODELS: 'vaultSyncModels',
  CHECK_SERVERS: 'vaultCheckServers',
} as const
