// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { QUEUES } from '@/constants/queues.js'
import { defineJob } from '@/core/queue/index.js'

import { CHAT_JOBS } from './chats.constants.js'

import type { ChatAttachmentsService } from './chatAttachments.service.js'
import type { ChatMaintenanceService } from './chatMaintenance.service.js'

/**
 * `knowledge-ingestion` / `processChatAttachment`: reads a PDF or Word attachment for the model
 * (the queue of the ML-bound document parsing). The service marks an unreadable file `failed`
 * itself; a retry only repeats a transient failure.
 */
export const createProcessChatAttachmentJob = (attachments: ChatAttachmentsService) =>
  defineJob({
    queue: QUEUES.KNOWLEDGE_INGESTION,
    name: CHAT_JOBS.PROCESS_ATTACHMENT,
    schema: z.object({ orgId: z.uuid(), attachmentId: z.uuid() }),
    options: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } },
    process:
      () =>
      async ({ orgId, attachmentId }) => {
        await attachments.process(orgId, attachmentId)
      },
  })

/** `maintenance` / `sweepChatStreams`: answers that stopped streaming become `interrupted`. */
export const createSweepChatStreamsJob = (maintenance: ChatMaintenanceService) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: CHAT_JOBS.SWEEP_STREAMS,
    schema: z.object({}),
    process: (runtime) => async () => {
      const interrupted = await maintenance.sweepStreams()
      if (interrupted > 0) runtime.logger.info({ interrupted }, 'chat streams interrupted')
    },
  })

/** `maintenance` / `cleanupChatAttachments`: attachments never sent, and chats left empty. */
export const createCleanupChatAttachmentsJob = (maintenance: ChatMaintenanceService) =>
  defineJob({
    queue: QUEUES.MAINTENANCE,
    name: CHAT_JOBS.CLEANUP_ATTACHMENTS,
    schema: z.object({}),
    process: (runtime) => async () => {
      runtime.logger.info(await maintenance.cleanupAttachments(), 'chat attachments cleaned up')
    },
  })
