// SPDX-License-Identifier: AGPL-3.0-only
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { PAGE_SIZE } from '@surefy/contracts'
import { apiClient } from '@surefy/web-core/http'
import type { HttpClient } from '@surefy/web-core/http'

import { chatFoldersApi, chatMessagesApi, chatsApi } from './chats.api'

export interface ChatListFilters {
  q?: string
  /** A folder id, or `none` for chats outside every folder. */
  folderId?: string
  isPinned?: boolean
  /** `deleted` is Recently deleted. */
  state?: 'active' | 'deleted'
  /** `lastMessageAt`, `pinnedAt` or `deletedAt`, with a leading `-` for newest first. */
  sort?: string
  limit?: number
  cursor?: string
}

export interface ChatMessageFilters {
  /** `createdAt`, or `-createdAt` to page backwards from the latest. */
  sort?: string
  limit?: number
  cursor?: string
}

/** The thread loads the latest messages first and pages backwards. */
export const CHAT_MESSAGES_PAGE_SIZE = 50

/** Query keys of the `chats` domain (services-api.md §3): chats, folders and messages. */
export const chatKeys = {
  all: (orgId: string) => ['orgs', orgId, 'chats'] as const,
  lists: (orgId: string) => [...chatKeys.all(orgId), 'list'] as const,
  list: (orgId: string, filters: ChatListFilters) => [...chatKeys.lists(orgId), filters] as const,
  detail: (orgId: string, chatId: string) => [...chatKeys.all(orgId), 'detail', chatId] as const,
  folders: (orgId: string) => [...chatKeys.all(orgId), 'folders'] as const,
  messages: (orgId: string, chatId: string) =>
    [...chatKeys.all(orgId), 'messages', chatId] as const,
  source: (orgId: string, chatId: string, messageId: string, index: number) =>
    [...chatKeys.messages(orgId, chatId), 'source', messageId, index] as const,
}

// `http` defaults to the browser client; server components pass getServerHttpClient()
export const chatQueries = {
  list: (orgId: string, filters: ChatListFilters, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: chatKeys.list(orgId, filters),
      queryFn: ({ pageParam, signal }) =>
        chatsApi.list(
          http,
          orgId,
          { ...filters, limit: filters.limit ?? PAGE_SIZE.default, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  detail: (orgId: string, chatId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: chatKeys.detail(orgId, chatId),
      queryFn: ({ signal }) => chatsApi.get(http, orgId, chatId, signal),
    }),
  /** A person's folders are few (at most `CHAT_FOLDERS_MAX`), so one request holds them all. */
  folders: (orgId: string, http: HttpClient = apiClient) =>
    queryOptions({
      queryKey: chatKeys.folders(orgId),
      queryFn: ({ signal }) => chatFoldersApi.list(http, orgId, signal).then((page) => page.items),
    }),
  /** Latest messages first (`-createdAt`); the thread reverses them. */
  messages: (orgId: string, chatId: string, http: HttpClient = apiClient) =>
    infiniteQueryOptions({
      queryKey: chatKeys.messages(orgId, chatId),
      queryFn: ({ pageParam, signal }) =>
        chatMessagesApi.list(
          http,
          orgId,
          chatId,
          { sort: '-createdAt', limit: CHAT_MESSAGES_PAGE_SIZE, cursor: pageParam },
          signal,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
  sourcePreview: (
    orgId: string,
    chatId: string,
    messageId: string,
    index: number,
    http: HttpClient = apiClient,
  ) =>
    queryOptions({
      queryKey: chatKeys.source(orgId, chatId, messageId, index),
      queryFn: ({ signal }) =>
        chatMessagesApi.sourcePreview(http, orgId, chatId, messageId, index, signal),
      // access is re-checked on every opening
      gcTime: 0,
    }),
}
