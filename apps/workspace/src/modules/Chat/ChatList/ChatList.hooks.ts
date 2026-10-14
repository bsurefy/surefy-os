// SPDX-License-Identifier: AGPL-3.0-only
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

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

/** A shared chat waiting for the T2 confirmation that names who loses access. */
export interface PendingChatDelete {
  chat: ChatDto
  peopleWithAccess: number
}

/**
 * What a chat row and a folder can do. Deleting a chat is T1 but reversible, so it runs at once
 * and Undo restores it; a chat shared with others is T2 and names the people who lose access
 * first. Deleting a folder cannot be reversed, so it is hidden first and only sent when the Undo
 * toast closes.
 */
export function useChatActions(orgId: string, orgSlug: string, openChatId: string | undefined) {
  const t = useTranslations('chat.list')
  const router = useRouter()
  const queryClient = useQueryClient()
  const update = useUpdateChatMutation(orgId)
  const deleteChat = useDeleteChatMutation(orgId)
  const restoreChat = useRestoreChatMutation(orgId)
  const deleteFolder = useDeleteChatFolderMutation(orgId)
  const [hiddenFolderIds, setHiddenFolderIds] = useState<readonly string[]>([])
  const [pendingDelete, setPendingDelete] = useState<PendingChatDelete | null>(null)

  const restore = (chat: ChatDto) => {
    restoreChat.mutate(chat.id, {
      onSuccess: () => {
        toast.success(t('toasts.chatRestored'))
      },
    })
  }

  const remove = (chat: ChatDto) => {
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
  }

  return {
    hiddenFolderIds,
    pendingDelete,
    onPin: (chat: ChatDto) => {
      update.mutate({ chatId: chat.id, isPinned: !chat.isPinned })
    },
    onMove: (chat: ChatDto, folderId: string | null) => {
      update.mutate({ chatId: chat.id, folderId })
    },
    onDelete: (chat: ChatDto) => {
      // private chats are never shared; any other may be, and then the impact is named first
      if (chat.isPrivate) {
        remove(chat)
        return
      }
      queryClient.query(chatQueries.shares(orgId, chat.id)).then(
        (shares) => {
          if (shares.sharingEnabled && shares.peopleWithAccess > 0) {
            setPendingDelete({ chat, peopleWithAccess: shares.peopleWithAccess })
          } else remove(chat)
        },
        () => {
          remove(chat)
        },
      )
    },
    onConfirmDelete: () => {
      if (pendingDelete) remove(pendingDelete.chat)
      setPendingDelete(null)
    },
    onCancelDelete: () => {
      setPendingDelete(null)
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
