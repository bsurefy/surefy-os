// SPDX-License-Identifier: AGPL-3.0-only
import { ChatAgentAnswers } from './chatAgentAnswers.js'
import { ChatAttachmentsRepository } from './chatAttachments.repository.js'
import { ChatAttachmentsService } from './chatAttachments.service.js'
import { ChatMaintenanceService } from './chatMaintenance.service.js'
import { ChatMessagesRepository } from './chatMessages.repository.js'
import { ChatMessagesService } from './chatMessages.service.js'
import { createChatModels } from './chatModels.js'
import { createChatPurgeHandlers } from './chatPurge.js'
import { ChatReaders } from './chatReaders.js'
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
  noChatWebSearch,
  type ChatAgentRuns,
  type ChatAudit,
  type ChatDocumentParser,
  type ChatGateway,
  type ChatNotifications,
  type ChatOrganizations,
  type ChatPii,
  type ChatRetrieval,
  type ChatWebSearch,
  type ChatUserRefs,
} from './chats.types.js'
import { deriveUploadKey } from './chats.utils.js'
import { ChatSharesRepository } from './chatShares.repository.js'
import { ChatSharesService } from './chatShares.service.js'
import { ChatStreamService } from './chatStream.service.js'
import { PromptsRepository } from './prompts.repository.js'
import { PromptsService } from './prompts.service.js'

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
  /** The personal-data filter of model calls; `guard.piiFilter`. */
  pii: ChatPii
  models: ModelGrants['modelsRepository']
  parser: ChatDocumentParser
  /** Knowledge retrieval for answers with sources; chats answer without sources until it exists. */
  retrieval?: ChatRetrieval
  /** Web search for answers that ask for it; without it the composer's toggle is refused. */
  webSearch?: ChatWebSearch
  /** Agent chats: the agents a person may talk to and the `chat` runs that answer. */
  agents: ChatAgentRuns
  /** Whether the organization allows chat sharing. */
  organizations: ChatOrganizations
  users: ChatUserRefs
  notifications: ChatNotifications
  audit: ChatAudit
}

/**
 * Chats: the person's conversations, folders, messages, feedback, attachments and the streaming
 * endpoint; shares, the prompt library, Compare and agent chats (V1). Answers come only through
 * the model gateway or an agent run; knowledge arrives through the `retrieval` port.
 */
export function createChatsModule(deps: ChatsModuleDeps) {
  const chats = new ChatsRepository()
  const messages = new ChatMessagesRepository()
  const attachmentRows = new ChatAttachmentsRepository()
  const shareRows = new ChatSharesRepository()
  const models = createChatModels(deps.models)
  const retrieval = deps.retrieval ?? noChatRetrieval
  const readers = new ChatReaders({ chats, shares: shareRows, organizations: deps.organizations })

  const chatsService = new ChatsService({
    db: deps.db,
    repository: chats,
    shares: shareRows,
    models,
    agents: deps.agents,
  })
  const messagesService = new ChatMessagesService({
    db: deps.db,
    chats,
    messages,
    readers,
    retrieval,
  })
  const shares = new ChatSharesService({
    db: deps.db,
    chats,
    shares: shareRows,
    readers,
    agents: deps.agents,
    organizations: deps.organizations,
    users: deps.users,
    notifications: deps.notifications,
    audit: deps.audit,
    logger: deps.logger,
  })
  const prompts = new PromptsService({
    db: deps.db,
    repository: new PromptsRepository(),
    users: deps.users,
    audit: deps.audit,
  })
  const agentAnswers = new ChatAgentAnswers({ messages, models })
  const stream = new ChatStreamService({
    db: deps.db,
    chats,
    messages,
    attachments: attachmentRows,
    models,
    gateway: deps.gateway,
    pii: deps.pii,
    retrieval,
    webSearch: deps.webSearch ?? noChatWebSearch,
    agents: deps.agents,
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
    shares,
    prompts,
    maintenance,
    /** Agent answers: `agentRuns` writes them in the transactions that pause and end a chat run. */
    agentAnswers,
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
        shares,
        prompts,
      }),
    ),
  }
}
export type ChatsModule = ReturnType<typeof createChatsModule>
