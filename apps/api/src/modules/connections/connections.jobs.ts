// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { CONNECTIONS_JOBS } from './connections.constants.js'

import type { ConnectionsMaintenance } from './connections.maintenance.js'
import type { ConnectionsLastUsed } from './connectionsLastUsed.js'

const noPayload = z.object({})

/**
 * `maintenance` / `connectionsRefresh` (scheduler `connections-refresh`, every 10 minutes):
 * renews OAuth 2 tokens expiring within 15 minutes. One attempt: the next run retries.
 */
export const createRefreshJob = (maintenance: ConnectionsMaintenance) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: CONNECTIONS_JOBS.REFRESH,
    schema: noPayload,
    options: { attempts: 1 },
    process: (runtime) => async () => {
      const run = await maintenance.refreshDue()
      if (run.due > 0) runtime.logger.info(run, 'connection tokens refreshed')
    },
  })

/** `maintenance` / `connectionsFlushLastUsed` (scheduler `connections-last-used`, every 5 minutes). */
export const createFlushLastUsedJob = (lastUsed: ConnectionsLastUsed) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: CONNECTIONS_JOBS.FLUSH_LAST_USED,
    schema: noPayload,
    options: { attempts: 1 },
    process: (runtime) => async () => {
      const updated = await lastUsed.flush()
      if (updated > 0) runtime.logger.info({ updated }, 'connection uses written')
    },
  })

/** `maintenance` / `connectionsCleanup` (scheduler `connections-cleanup-daily`): past 13 months. */
export const createCleanupJob = (maintenance: ConnectionsMaintenance) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: CONNECTIONS_JOBS.CLEANUP,
    schema: noPayload,
    options: { attempts: 2 },
    process: (runtime) => async () => {
      const deleted = await maintenance.deleteExpiredRevoked()
      if (deleted > 0) runtime.logger.info({ deleted }, 'disconnected connections deleted')
    },
  })
