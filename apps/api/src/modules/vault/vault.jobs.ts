// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { VAULT_JOBS } from './vault.constants.js'

import type { VaultMaintenance } from './vaultMaintenance.js'

const noPayload = z.object({})

/** `maintenance` / `vaultExpireKeys` (scheduler `vault-keys-daily`): expiry, then the warnings. */
export const createExpireKeysJob = (maintenance: VaultMaintenance) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: VAULT_JOBS.EXPIRE_KEYS,
    schema: noPayload,
    options: { attempts: 2 },
    process: (runtime) => async () => {
      const result = await maintenance.expireAndWarn()
      if (result.expired > 0 || result.warned > 0) runtime.logger.info(result, 'vault keys checked')
    },
  })

/** `maintenance` / `vaultSyncModels` (scheduler `vault-sync-daily`): every organization's models. */
export const createSyncModelsJob = (maintenance: VaultMaintenance) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: VAULT_JOBS.SYNC_MODELS,
    schema: noPayload,
    options: { attempts: 1 },
    process: (runtime) => async () => {
      runtime.logger.info(await maintenance.syncAll(), 'vault models synced')
    },
  })

/**
 * `maintenance` / `vaultCheckServers` (scheduler `vault-servers-health`, every 5 minutes). One
 * attempt: the next run retries.
 */
export const createCheckServersJob = (maintenance: VaultMaintenance) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: VAULT_JOBS.CHECK_SERVERS,
    schema: noPayload,
    options: { attempts: 1 },
    process: (runtime) => async () => {
      const result = await maintenance.checkServers()
      if (result.down > 0) runtime.logger.warn(result, 'local model servers down')
    },
  })
