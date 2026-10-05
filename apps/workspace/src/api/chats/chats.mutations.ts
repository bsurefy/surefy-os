// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type {
  CreateChatFolderInput,
  RequestChatAttachmentUploadInput,
  SetChatFeedbackInput,
  UpdateChatFolderInput,
  UpdateChatInput,
} from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { MutationHookOptions } from '@surefy/web-core/query'

import { chatAttachmentsApi, chatFoldersApi, chatMessagesApi, chatsApi } from './chats.api'
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

/** Rates an answer; rating again replaces the rating. The message list refreshes to show it. */
export function useSetChatFeedbackMutation(
  orgId: string,
  chatId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: ({ messageId, ...input }: SetChatFeedbackInput & { messageId: string }) =>
      chatMessagesApi.setFeedback(apiClient, orgId, chatId, messageId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.messages(orgId, chatId) }),
  })
}

export function useClearChatFeedbackMutation(
  orgId: string,
  chatId: string,
  { silent = false }: MutationHookOptions = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: (messageId: string) =>
      chatMessagesApi.clearFeedback(apiClient, orgId, chatId, messageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatKeys.messages(orgId, chatId) }),
  })
}

/** The attachment steps; the bytes themselves go straight to storage in between. */
export function useChatAttachmentMutations(orgId: string, chatId: string) {
  return {
    requestUpload: (input: RequestChatAttachmentUploadInput) =>
      chatAttachmentsApi.requestUpload(apiClient, orgId, chatId, input),
    complete: (attachmentId: string) =>
      chatAttachmentsApi.complete(apiClient, orgId, chatId, attachmentId),
    retry: (attachmentId: string) =>
      chatAttachmentsApi.retry(apiClient, orgId, chatId, attachmentId),
    remove: (attachmentId: string) =>
      chatAttachmentsApi.remove(apiClient, orgId, chatId, attachmentId),
  }
}
