// SPDX-License-Identifier: AGPL-3.0-only
import type { ChatDto, ChatFolderDto } from '@surefy/contracts'

import type { ChatActions } from '../ChatList.hooks'

/** What every row of the list needs besides its chat. */
export interface ChatRowContext {
  orgSlug: string
  /** The chat open in the thread, highlighted in the list. */
  openChatId: string | undefined
  folders: readonly ChatFolderDto[]
  actions: ChatActions
  onRename: (chat: ChatDto) => void
  onExport: (chat: ChatDto) => void
}
