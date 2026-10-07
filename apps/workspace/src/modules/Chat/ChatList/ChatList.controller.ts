// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { chatQueries } from '@/api/chats'
import type { ChatDto, ChatFolderDto } from '@surefy/contracts'
import { useCurrentOrgId } from '@surefy/web-core/access'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import { SEARCH_DEBOUNCE_MS } from './ChatList.constants'
import { useChatActions, useChatPages, useDebouncedValue } from './ChatList.hooks'

import type { ChatListView } from './ChatList.constants'
import type { NameTarget } from './NameDialog'

/** The dialog that is open over the list, if any. */
export type ChatListDialog = NameTarget | { kind: 'export'; chat: ChatDto }

/**
 * The chat list beside the thread: Pinned, Folders and the date groups, or the search results, or
 * Recently deleted in their place. The open chat comes from the URL.
 */
export function useChatListController() {
  const t = useTranslations('chat.list')
  const tErrors = useTranslations('errors')
  const orgId = useCurrentOrgId()
  const { orgSlug, chatId } = useParams<{ orgSlug: string; chatId?: string }>()
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)
  const [view, setView] = useState<ChatListView>('chats')
  const [dialog, setDialog] = useState<ChatListDialog | null>(null)
  const [expandedFolderIds, setExpandedFolderIds] = useState<readonly string[]>([])
  const actions = useChatActions(orgId, orgSlug, chatId)

  const isSearching = query !== ''
  const isListing = view === 'chats' && !isSearching
  const folderList = useQuery(chatQueries.folders(orgId))
  const pinned = useChatPages(orgId, { isPinned: true, sort: '-pinnedAt' }, isListing)
  const dated = useChatPages(orgId, { folderId: 'none', isPinned: false }, isListing)
  const results = useChatPages(orgId, { q: query }, isSearching)

  const folders = (folderList.data ?? []).filter(({ id }) => !actions.hiddenFolderIds.includes(id))
  const loadError =
    dated.errorMessage ?? (folderList.error ? getErrorMessage(folderList.error, tErrors) : null)
  const isLoading = dated.isLoading || folderList.isPending

  return {
    t,
    orgId,
    ctx: {
      orgSlug,
      openChatId: chatId,
      folders,
      actions,
      onRename: (chat: ChatDto) => {
        setDialog({ kind: 'renameChat', chat })
      },
      onExport: (chat: ChatDto) => {
        setDialog({ kind: 'export', chat })
      },
    },
    actions,
    search,
    onSearchChange: setSearch,
    onClearSearch: () => {
      setSearch('')
    },
    query,
    isSearching,
    results,
    view,
    onOpenDeleted: () => {
      setView('deleted')
    },
    onCloseDeleted: () => {
      setView('chats')
    },
    pinned,
    dated,
    folders,
    expandedFolderIds,
    onToggleFolder: (folderId: string) => {
      setExpandedFolderIds((ids) =>
        ids.includes(folderId) ? ids.filter((id) => id !== folderId) : [...ids, folderId],
      )
    },
    isLoading,
    loadError,
    loadErrorReference: isApiError(folderList.error)
      ? folderList.error.requestId
      : dated.errorReference,
    onRetry: () => {
      dated.refetch()
      void folderList.refetch()
    },
    isEmpty:
      !isLoading &&
      !loadError &&
      dated.chats.length === 0 &&
      pinned.chats.length === 0 &&
      folders.length === 0,
    dialog,
    onNewFolder: () => {
      setDialog({ kind: 'newFolder' })
    },
    onRenameFolder: (folder: ChatFolderDto) => {
      setDialog({ kind: 'renameFolder', folder })
    },
    onCloseDialog: () => {
      setDialog(null)
    },
  }
}
