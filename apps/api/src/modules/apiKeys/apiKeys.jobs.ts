// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { API_KEYS_JOBS } from './apiKeys.constants.js'

import type { ApiKeysMaintenance } from './apiKeys.maintenance.js'
import type { ApiKeysLastUsed } from './apiKeysLastUsed.js'

const noPayload = z.object({})

/**
 * `maintenance` / `apiKeysFlushLastUsed` (scheduler `api-keys-last-used`, every 5 minutes): writes
 * the buffered uses of keys to `last_used_at` and `last_used_ip`. One attempt: the next run
 * writes what was noted since.
 */
export const createFlushLastUsedJob = (lastUsed: ApiKeysLastUsed) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: API_KEYS_JOBS.FLUSH_LAST_USED,
    schema: noPayload,
    options: { attempts: 1 },
    process: (runtime) => async () => {
      const updated = await lastUsed.flush()
      if (updated > 0) runtime.logger.info({ updated }, 'api key uses written')
    },
  })

/** `maintenance` / `apiKeysCleanup` (scheduler `api-keys-cleanup-daily`): revoked keys past 13 months. */
export const createCleanupJob = (maintenance: ApiKeysMaintenance) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: API_KEYS_JOBS.CLEANUP,
    schema: noPayload,
    options: { attempts: 2 },
    process: (runtime) => async () => {
      const deleted = await maintenance.deleteExpiredRevoked()
      if (deleted > 0) runtime.logger.info({ deleted }, 'revoked api keys deleted')
    },
  })
