// SPDX-License-Identifier: AGPL-3.0-only
import { outboxHandler, type OutboxHandler } from '@/modules/outbox/index.js'

import type { StorageProvider } from '@/integrations/storage/index.js'

/** Every object of one chat: `orgs/{orgId}/chats/{chatId}/` (attachments). */
export const chatPrefix = (orgId: string, chatId: string): string =>
  `orgs/${orgId}/chats/${chatId}/`

/**
 * `chat.purged`: `purge_soft_deleted` deleted the chat and its rows (attachments cascade); this
 * removes their stored objects. Deleting a prefix twice is harmless.
 */
export function createChatPurgeHandlers(storage: StorageProvider): OutboxHandler[] {
  return [
    outboxHandler('chat.purged', 'deleteChatObjects', async ({ orgId, payload }) => {
      if (orgId === null) return
      await storage.deletePrefix(chatPrefix(orgId, payload.id))
    }),
  ]
}
