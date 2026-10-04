// SPDX-License-Identifier: AGPL-3.0-only
import { CHAT_FOLDERS_MAX } from '@surefy/contracts'
import type {
  ChatDto,
  ChatFolderDto,
  CreateChatFolderInput,
  UpdateChatFolderInput,
  UpdateChatInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type { ChatListFilters } from './chats.queries'

/** The signed-in person's chats and folders (Chat). */
export const chatsApi = {
  list: (http: HttpClient, orgId: string, query: ChatListFilters, signal?: AbortSignal) =>
    http.getPage<ChatDto>(`/orgs/${orgId}/chats`, { params: { ...query }, signal }),
  get: (http: HttpClient, orgId: string, chatId: string, signal?: AbortSignal) =>
    http.get<ChatDto>(`/orgs/${orgId}/chats/${chatId}`, { signal }),
  update: (http: HttpClient, orgId: string, chatId: string, input: UpdateChatInput) =>
    http.patch<ChatDto>(`/orgs/${orgId}/chats/${chatId}`, input),
  /** Moves the chat to Recently deleted; `restore` brings it back within 30 days. */
  delete: (http: HttpClient, orgId: string, chatId: string) =>
    http.delete(`/orgs/${orgId}/chats/${chatId}`),
  restore: (http: HttpClient, orgId: string, chatId: string) =>
    http.post<ChatDto>(`/orgs/${orgId}/chats/${chatId}/restore`),
}

export const chatFoldersApi = {
  list: (http: HttpClient, orgId: string, signal?: AbortSignal) =>
    http.getPage<ChatFolderDto>(`/orgs/${orgId}/chat-folders`, {
      params: { limit: CHAT_FOLDERS_MAX },
      signal,
    }),
  create: (http: HttpClient, orgId: string, input: CreateChatFolderInput) =>
    http.post<ChatFolderDto>(`/orgs/${orgId}/chat-folders`, input),
  update: (http: HttpClient, orgId: string, folderId: string, input: UpdateChatFolderInput) =>
    http.patch<ChatFolderDto>(`/orgs/${orgId}/chat-folders/${folderId}`, input),
  /** Its chats move back to the list. */
  delete: (http: HttpClient, orgId: string, folderId: string) =>
    http.delete(`/orgs/${orgId}/chat-folders/${folderId}`),
}
