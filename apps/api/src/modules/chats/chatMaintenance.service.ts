// SPDX-License-Identifier: AGPL-3.0-only
import {
  INTERRUPTED_ERROR_CODE,
  STREAM_STALE_MS,
  UNLINKED_ATTACHMENT_HOURS,
} from './chats.constants.js'

import type { ChatAttachmentsRepository } from './chatAttachments.repository.js'
import type { ChatMessagesRepository } from './chatMessages.repository.js'
import type { Database } from '@/core/database/index.js'
import type { Logger } from '@/core/logger/index.js'
import type { StorageProvider } from '@/integrations/storage/index.js'

const HOUR_MS = 3_600_000
const BATCH = 200

export interface ChatMaintenanceDeps {
  db: Database
  messages: ChatMessagesRepository
  attachments: ChatAttachmentsRepository
  storage: StorageProvider
  logger: Logger
  now?: () => number
}

/** The recurring clean-up of chats (database/chat.md, §4 and §7), under system scope. */
export class ChatMaintenanceService {
  constructor(private readonly deps: ChatMaintenanceDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /** `streaming → interrupted` for answers not updated for two minutes; their partial text stays. */
  sweepStreams(): Promise<number> {
    const before = new Date(this.now() - STREAM_STALE_MS)
    return this.deps.db.system('maintenance', (tx) =>
      this.deps.messages.interruptStale(tx, before, INTERRUPTED_ERROR_CODE, null),
    )
  }

  /**
   * Attachments never sent with a message after 24 hours (row and object), then the chats that
   * never got a message. An object that cannot be deleted keeps its row for the next run.
   */
  async cleanupAttachments(): Promise<{ attachments: number; chats: number }> {
    const before = new Date(this.now() - UNLINKED_ATTACHMENT_HOURS * HOUR_MS)
    let attachments = 0
    for (;;) {
      const batch = await this.deps.db.system('maintenance', (tx) =>
        this.deps.attachments.unlinkedBefore(tx, before, BATCH),
      )
      const removed: string[] = []
      for (const row of batch) {
        try {
          await this.deps.storage.delete(row.objectKey)
          removed.push(row.id)
        } catch (error) {
          this.deps.logger.warn({ err: error, attachmentId: row.id }, 'attachment object kept')
        }
      }
      await this.deps.db.system('maintenance', (tx) =>
        this.deps.attachments.deleteMany(tx, removed),
      )
      attachments += removed.length
      if (removed.length < BATCH) break
    }
    const chats = await this.deps.db.system('maintenance', (tx) =>
      this.deps.attachments.deleteEmptyChats(tx, before),
    )
    return { attachments, chats }
  }
}
