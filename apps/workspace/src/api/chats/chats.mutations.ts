// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  CreateChatFolderInput,
  UpdateChatFolderInput,
  UpdateChatInput,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { chatFoldersApi, chatsApi } from './chats.api'
import { chatKeys } from './chats.queries'

/** Lists, folders (with their chat counts) and open chats all change together. */
function useRefreshChats(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: chatKeys.all(orgId) })
}

export function useUpdateChatMutation(orgId: string, { silent = false }: MutationHookOptions = {}) {
  const refresh = useRefreshChats(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ chatId, ...input }: UpdateChatInput & { chatId: string }) =>
      chatsApi.update(apiClient, orgId, chatId, input),
    onSuccess: refresh,
  })
}

export function useDeleteChatMutation(orgId: string, { silent = false }: MutationHookOptions = {}) {
  const refresh = useRefreshChats(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (chatId: string) => chatsApi.delete(apiClient, orgId, chatId),
    onSuccess: refresh,
  })
}

export function useRestoreChatMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshChats(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (chatId: string) => chatsApi.restore(apiClient, orgId, chatId),
    onSuccess: refresh,
  })
}

export function useCreateChatFolderMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshChats(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (input: CreateChatFolderInput) => chatFoldersApi.create(apiClient, orgId, input),
    onSuccess: refresh,
  })
}

export function useUpdateChatFolderMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshChats(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: ({ folderId, ...input }: UpdateChatFolderInput & { folderId: string }) =>
      chatFoldersApi.update(apiClient, orgId, folderId, input),
    onSuccess: refresh,
  })
}

export function useDeleteChatFolderMutation(
  orgId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const refresh = useRefreshChats(orgId)
  return useMutation({
    meta: { silent },
    mutationFn: (folderId: string) => chatFoldersApi.delete(apiClient, orgId, folderId),
    onSuccess: refresh,
  })
}
