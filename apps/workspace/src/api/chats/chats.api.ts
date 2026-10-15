// SPDX-License-Identifier: AGPL-3.0-only
import { CHAT_FOLDERS_MAX } from '@surefy/contracts'
import type {
  ChatAttachmentDto,
  ChatAttachmentUploadDto,
  ChatDto,
  ChatFeedbackDto,
  ChatFolderDto,
  ChatMessageDto,
  ChatSharesDto,
  ChatShareTargetDto,
  ChatSourcePreviewDto,
  CreateChatFolderInput,
  CreateChatSharesInput,
  RequestChatAttachmentUploadInput,
  SetChatFeedbackInput,
  SharedChatDetailDto,
  SharedChatDto,
  UpdateChatFolderInput,
  UpdateChatInput,
} from '@surefy/contracts'
import type { HttpClient } from '@surefy/web-core/http'

import type {
  ChatListFilters,
  ChatMessageFilters,
  ChatShareTargetFilters,
  SharedChatFilters,
} from './chats.queries'

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

/** A chat's messages, answers' feedback, cited sources and attachments (the thread). */
export const chatMessagesApi = {
  /** Superseded messages are never returned; `-createdAt` pages backwards from the latest. */
  list: (
    http: HttpClient,
    orgId: string,
    chatId: string,
    query: ChatMessageFilters,
    signal?: AbortSignal,
  ) =>
    http.getPage<ChatMessageDto>(`/orgs/${orgId}/chats/${chatId}/messages`, {
      params: { ...query },
      signal,
    }),
  setFeedback: (
    http: HttpClient,
    orgId: string,
    chatId: string,
    messageId: string,
    input: SetChatFeedbackInput,
  ) =>
    http.put<ChatFeedbackDto>(
      `/orgs/${orgId}/chats/${chatId}/messages/${messageId}/feedback`,
      input,
    ),
  clearFeedback: (http: HttpClient, orgId: string, chatId: string, messageId: string) =>
    http.delete(`/orgs/${orgId}/chats/${chatId}/messages/${messageId}/feedback`),
  /** "Continue with A/B": the other answer of the comparison becomes superseded. */
  choose: (http: HttpClient, orgId: string, chatId: string, messageId: string) =>
    http.post<ChatMessageDto>(`/orgs/${orgId}/chats/${chatId}/messages/${messageId}/choose`),
  /** Re-checks that the person may still read the source, so it can answer `removed` or `no_access`. */
  sourcePreview: (
    http: HttpClient,
    orgId: string,
    chatId: string,
    messageId: string,
    index: number,
    signal?: AbortSignal,
  ) =>
    http.get<ChatSourcePreviewDto>(
      `/orgs/${orgId}/chats/${chatId}/messages/${messageId}/sources/${String(index)}`,
      { signal },
    ),
}

export const chatAttachmentsApi = {
  /** The type and size are checked before a row or an upload URL exists. */
  requestUpload: (
    http: HttpClient,
    orgId: string,
    chatId: string,
    input: RequestChatAttachmentUploadInput,
  ) => http.post<ChatAttachmentUploadDto>(`/orgs/${orgId}/chats/${chatId}/attachments`, input),
  /** Called once the bytes reached storage; the file is then checked and, for documents, read. */
  complete: (http: HttpClient, orgId: string, chatId: string, attachmentId: string) =>
    http.post<ChatAttachmentDto>(
      `/orgs/${orgId}/chats/${chatId}/attachments/${attachmentId}/complete`,
    ),
  retry: (http: HttpClient, orgId: string, chatId: string, attachmentId: string) =>
    http.post<ChatAttachmentUploadDto>(
      `/orgs/${orgId}/chats/${chatId}/attachments/${attachmentId}/retry`,
    ),
  remove: (http: HttpClient, orgId: string, chatId: string, attachmentId: string) =>
    http.delete(`/orgs/${orgId}/chats/${chatId}/attachments/${attachmentId}`),
}

/** The streaming endpoint `useChat` posts to (services-api.md §7). */
export const chatStreamPath = (orgId: string, chatId: string) =>
  `/orgs/${orgId}/chats/${chatId}/messages`

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

/** View-only shares of the person's own chats with people and teams of the organization. */
export const chatSharesApi = {
  list: (http: HttpClient, orgId: string, chatId: string, signal?: AbortSignal) =>
    http.get<ChatSharesDto>(`/orgs/${orgId}/chats/${chatId}/shares`, { signal }),
  /** Subjects that already have a share are left as they are. */
  create: (http: HttpClient, orgId: string, chatId: string, input: CreateChatSharesInput) =>
    http.post<ChatSharesDto>(`/orgs/${orgId}/chats/${chatId}/shares`, input),
  delete: (http: HttpClient, orgId: string, chatId: string, shareId: string) =>
    http.delete(`/orgs/${orgId}/chats/${chatId}/shares/${shareId}`),
  /** The people and teams the share dialog can pick; fails while sharing is turned off. */
  targets: (http: HttpClient, orgId: string, query: ChatShareTargetFilters, signal?: AbortSignal) =>
    http.getPage<ChatShareTargetDto>(`/orgs/${orgId}/chat-share-targets`, {
      params: { ...query },
      signal,
    }),
}

/** Chats others shared with the person ("Shared with me"); their messages use `chatMessagesApi`. */
export const sharedChatsApi = {
  list: (http: HttpClient, orgId: string, query: SharedChatFilters, signal?: AbortSignal) =>
    http.getPage<SharedChatDto>(`/orgs/${orgId}/shared-chats`, { params: { ...query }, signal }),
  get: (http: HttpClient, orgId: string, chatId: string, signal?: AbortSignal) =>
    http.get<SharedChatDetailDto>(`/orgs/${orgId}/shared-chats/${chatId}`, { signal }),
}
