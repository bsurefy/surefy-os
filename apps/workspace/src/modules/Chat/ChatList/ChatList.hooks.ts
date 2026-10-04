// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import {
  chatQueries,
  useDeleteChatFolderMutation,
  useDeleteChatMutation,
  useRestoreChatMutation,
  useUpdateChatMutation,
} from '@/api/chats'
import { ROUTES } from '@/constants/routes'
import { toRoute } from '@/modules/Workspace'
import type { ChatDto, ChatFolderDto } from '@surefy/contracts'
import { toast } from '@surefy/ui/components/Feedback'
import { getErrorMessage, isApiError } from '@surefy/web-core/errors'

import type { ChatListFilters } from '@/api/chats'

/** The value, but only once it has stopped changing for `delayMs`. */
export function useDebouncedValue<Value>(value: Value, delayMs: number): Value {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])
  return debounced
}

/** One filtered list of chats, loaded a page at a time. */
export function useChatPages(orgId: string, filters: ChatListFilters, isEnabled = true) {
  const tErrors = useTranslations('errors')
  const list = useInfiniteQuery({ ...chatQueries.list(orgId, filters), enabled: isEnabled })
  return {
    chats: list.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: isEnabled && list.isPending,
    errorMessage: list.error ? getErrorMessage(list.error, tErrors) : null,
    errorReference: isApiError(list.error) ? list.error.requestId : undefined,
    refetch: () => void list.refetch(),
    hasMore: list.hasNextPage,
    isLoadingMore: list.isFetchingNextPage,
    onLoadMore: () => void list.fetchNextPage(),
  }
}
export type ChatPages = ReturnType<typeof useChatPages>

/**
 * What a chat row and a folder can do. Deleting a chat is T1 but reversible, so it runs at once
 * and Undo restores it; deleting a folder cannot be reversed, so it is hidden first and only sent
 * when the Undo toast closes.
 */
export function useChatActions(orgId: string, orgSlug: string, openChatId: string | undefined) {
  const t = useTranslations('chat.list')
  const router = useRouter()
  const update = useUpdateChatMutation(orgId)
  const deleteChat = useDeleteChatMutation(orgId)
  const restoreChat = useRestoreChatMutation(orgId)
  const deleteFolder = useDeleteChatFolderMutation(orgId)
  const [hiddenFolderIds, setHiddenFolderIds] = useState<readonly string[]>([])

  const restore = (chat: ChatDto) => {
    restoreChat.mutate(chat.id, {
      onSuccess: () => {
        toast.success(t('toasts.chatRestored'))
      },
    })
  }

  return {
    hiddenFolderIds,
    onPin: (chat: ChatDto) => {
      update.mutate({ chatId: chat.id, isPinned: !chat.isPinned })
    },
    onMove: (chat: ChatDto, folderId: string | null) => {
      update.mutate({ chatId: chat.id, folderId })
    },
    onDelete: (chat: ChatDto) => {
      deleteChat.mutate(chat.id, {
        onSuccess: () => {
          if (openChatId === chat.id) router.push(toRoute(ROUTES.workspace.chat(orgSlug)))
          toast.undo(t('toasts.chatDeleted'), {
            undoLabel: t('undo'),
            onUndo: () => {
              restoreChat.mutate(chat.id)
            },
          })
        },
      })
    },
    onRestore: restore,
    onDeleteFolder: (folder: ChatFolderDto) => {
      const show = () => {
        setHiddenFolderIds((ids) => ids.filter((id) => id !== folder.id))
      }
      setHiddenFolderIds((ids) => [...ids, folder.id])
      toast.undo(t('toasts.folderDeleted', { name: folder.name }), {
        undoLabel: t('undo'),
        onUndo: show,
        onCommit: () => {
          deleteFolder.mutate(folder.id, { onSettled: show })
        },
      })
    },
  }
}
export type ChatActions = ReturnType<typeof useChatActions>
