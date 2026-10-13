// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { chatDtoSchema, chatParamsSchema } from './schemas.js'
import { userRefDtoSchema } from '../auth/schemas.js'
import { pageQuery } from '../core/pagination.js'
import { orgParamsSchema } from '../core/params.js'
import { teamRefDtoSchema } from '../teams/schemas.js'

// Shared chats (database/chat.md §8; Chat › Share, Chat list › Shared with me). Routes, all under
// /api/v1/orgs/:orgId (`chat:use`):
// GET/POST /chats/:chatId/shares · DELETE /chats/:chatId/shares/:shareId (the owner only) ·
// GET /shared-chats · GET /shared-chats/:chatId.
// A share is view only and never leaves the organization. People a chat is shared with also read
// it through GET /chats/:chatId/messages, the source preview and the attachment URLs; every other
// chat route stays the owner's. Sharing needs `organizations.settings.privacy.chatSharingEnabled`;
// while it is off, the rows are kept and none is honored. Private and deleted chats are never
// shown through a share: their readers get CHAT_NOT_FOUND ("This chat isn't available").

export const CHAT_SHARE_SUBJECT_TYPES = ['user', 'team'] as const
export type ChatShareSubjectType = (typeof CHAT_SHARE_SUBJECT_TYPES)[number]

/** Most people and teams one chat is shared with. */
export const CHAT_SHARES_MAX = 100

export const chatShareParamsSchema = chatParamsSchema.extend({ shareId: z.uuid() })
export type ChatShareParams = z.infer<typeof chatShareParamsSchema>

export const chatShareSubjectSchema = z.discriminatedUnion('subjectType', [
  z.object({ subjectType: z.literal('user'), userId: z.uuid() }),
  z.object({ subjectType: z.literal('team'), teamId: z.uuid() }),
])
export type ChatShareSubject = z.infer<typeof chatShareSubjectSchema>

/**
 * `POST …/chats/:chatId/shares`: share with people and teams of the organization. Subjects that
 * already have a share are left as they are. Each new person, and each member of a new team,
 * gets the `chat.shared` notification.
 */
export const createChatSharesInputSchema = z.object({
  subjects: z.array(chatShareSubjectSchema).min(1).max(CHAT_SHARES_MAX),
})
export type CreateChatSharesInput = z.infer<typeof createChatSharesInputSchema>

export const chatShareDtoSchema = z.object({
  id: z.uuid(),
  subjectType: z.enum(CHAT_SHARE_SUBJECT_TYPES),
  /** Set for `user` shares. */
  user: userRefDtoSchema.nullable(),
  /** Set for `team` shares; `memberCount` for "Support · 8 people". */
  team: teamRefDtoSchema.extend({ memberCount: z.number().int().nonnegative() }).nullable(),
  sharedBy: userRefDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
})
export type ChatShareDto = z.infer<typeof chatShareDtoSchema>

/**
 * `GET …/chats/:chatId/shares` (the owner) and the answer of `POST`. `peopleWithAccess` counts the
 * distinct people the shares reach, without the owner: deleting the chat or turning it private
 * names them ("3 people will lose access").
 */
export const chatSharesDtoSchema = z.object({
  shares: z.array(chatShareDtoSchema).max(CHAT_SHARES_MAX),
  peopleWithAccess: z.number().int().nonnegative(),
  /** The organization allows sharing; when false the dialog explains who can turn it on. */
  sharingEnabled: z.boolean(),
})
export type ChatSharesDto = z.infer<typeof chatSharesDtoSchema>

/** `GET /shared-chats`: chats others shared with the person or their teams, newest message first. */
export const listSharedChatsQuerySchema = pageQuery
export type ListSharedChatsQuery = z.infer<typeof listSharedChatsQuerySchema>

/** A row of "Shared with me". */
export const sharedChatDtoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  owner: userRefDtoSchema.nullable(),
  lastMessageAt: z.iso.datetime().nullable(),
  sharedAt: z.iso.datetime(),
})
export type SharedChatDto = z.infer<typeof sharedChatDtoSchema>

export const sharedChatParamsSchema = orgParamsSchema.extend({ chatId: z.uuid() })
export type SharedChatParams = z.infer<typeof sharedChatParamsSchema>

/**
 * `GET /shared-chats/:chatId`: the view-only thread header, "Shared by Maya · view only". The
 * owner's own settings (folder, pin, knowledge scope, next model) are not part of it.
 */
export const sharedChatDetailDtoSchema = chatDtoSchema
  .pick({ id: true, title: true, agentId: true, lastMessageAt: true, messageCount: true })
  .extend({
    owner: userRefDtoSchema.nullable(),
    sharedBy: userRefDtoSchema.nullable(),
    sharedAt: z.iso.datetime(),
  })
export type SharedChatDetailDto = z.infer<typeof sharedChatDetailDtoSchema>

/** `NotificationParams` of `chat.shared` (target type `chat`). */
export const chatSharedParamsSchema = z.object({
  version: z.literal(1),
  chatTitle: z.string(),
  /** Set when the chat reached the person through a team. */
  teamName: z.string().nullable(),
})
export type ChatSharedParams = z.infer<typeof chatSharedParamsSchema>
