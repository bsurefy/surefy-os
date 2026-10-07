// SPDX-License-Identifier: AGPL-3.0-only
import { ChatAttachmentsRepository } from './chatAttachments.repository.js'
import { ChatAttachmentsService } from './chatAttachments.service.js'
import { ChatMaintenanceService } from './chatMaintenance.service.js'
import { ChatMessagesRepository } from './chatMessages.repository.js'
import { ChatMessagesService } from './chatMessages.service.js'
import { createChatModels } from './chatModels.js'
import { createChatPurgeHandlers } from './chatPurge.js'
import { ChatsController } from './chats.controller.js'
import {
  createCleanupChatAttachmentsJob,
  createProcessChatAttachmentJob,
  createSweepChatStreamsJob,
} from './chats.jobs.js'
import { ChatsRepository } from './chats.repository.js'
import { chatsRoutes } from './chats.routes.js'
import { ChatsService } from './chats.service.js'
import {
  noChatRetrieval,
  type ChatDocumentParser,
  type ChatGateway,
  type ChatRetrieval,
} from './chats.types.js'
import { deriveUploadKey } from './chats.utils.js'
import { ChatStreamService } from './chatStream.service.js'

import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { Queues } from '@/core/queue/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'
import type { ModelGrants } from '@/modules/vault/index.js'

export interface ChatsModuleDeps {
  db: Database
  queues: Queues
  logger: Logger
  storage: StorageProvider
  /** `ENCRYPTION_KEY`: the signing key of upload URLs is derived from it. */
  encryptionKey: string
  gateway: ChatGateway
  models: ModelGrants['modelsRepository']
  parser: ChatDocumentParser
  /** Knowledge retrieval for answers with sources; chats answer without sources until it exists. */
  retrieval?: ChatRetrieval
}

/**
 * Chats: the person's conversations, folders, messages, feedback, attachments and the streaming
 * endpoint. Answers come only through the model gateway; knowledge arrives through the
 * `retrieval` port.
 */
export function createChatsModule(deps: ChatsModuleDeps) {
  const chats = new ChatsRepository()
  const messages = new ChatMessagesRepository()
  const attachmentRows = new ChatAttachmentsRepository()
  const models = createChatModels(deps.models)
  const retrieval = deps.retrieval ?? noChatRetrieval

  const chatsService = new ChatsService({ db: deps.db, repository: chats, models })
  const messagesService = new ChatMessagesService({ db: deps.db, chats, messages, retrieval })
  const stream = new ChatStreamService({
    db: deps.db,
    chats,
    messages,
    attachments: attachmentRows,
    models,
    gateway: deps.gateway,
    retrieval,
    storage: deps.storage,
    logger: deps.logger,
  })
  // the job is defined after the service it runs; the service enqueues it lazily
  const processJob = (): ReturnType<typeof createProcessChatAttachmentJob> => processAttachment
  const attachments: ChatAttachmentsService = new ChatAttachmentsService({
    db: deps.db,
    chats,
    attachments: attachmentRows,
    storage: deps.storage,
    parser: deps.parser,
    uploadKey: deriveUploadKey(deps.encryptionKey),
    enqueueProcessing: async (orgId, attachmentId) => {
      await deps.queues.enqueue(
        processJob(),
        { orgId, attachmentId },
        { jobId: `chat-attachment-${attachmentId}` },
      )
    },
    logger: deps.logger,
  })
  const processAttachment = createProcessChatAttachmentJob(attachments)
  const maintenance = new ChatMaintenanceService({
    db: deps.db,
    messages,
    attachments: attachmentRows,
    storage: deps.storage,
    logger: deps.logger,
  })

  return {
    service: chatsService,
    messages: messagesService,
    stream,
    attachments,
    maintenance,
    /** `chat.purged` removes the purged chat's stored objects. */
    outboxHandlers: createChatPurgeHandlers(deps.storage),
    jobs: [
      processAttachment,
      createSweepChatStreamsJob(maintenance),
      createCleanupChatAttachmentsJob(maintenance),
    ],
    routes: chatsRoutes(
      new ChatsController({
        chats: chatsService,
        messages: messagesService,
        stream,
        attachments,
      }),
    ),
  }
}
export type ChatsModule = ReturnType<typeof createChatsModule>
