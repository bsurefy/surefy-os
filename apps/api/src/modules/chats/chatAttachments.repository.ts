// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm'

import { chatAttachments, chats } from '@/database/tables/index.js'

import type { ChatAttachmentRow } from './chats.mapper.js'
import type { DbExecutor } from '@/core/database/index.js'

const a = chatAttachments

export type NewChatAttachmentRow = typeof chatAttachments.$inferInsert

/** What the upload, the processing and Retry write onto an attachment. */
export type ChatAttachmentPatch = Partial<
  Pick<
    ChatAttachmentRow,
    | 'status'
    | 'errorCode'
    | 'contentType'
    | 'sha256'
    | 'extractedText'
    | 'pageCount'
    | 'sizeBytes'
    | 'messageId'
  >
>

/** `chat_attachments`. */
export class ChatAttachmentsRepository {
  async insert(tx: DbExecutor, row: NewChatAttachmentRow): Promise<ChatAttachmentRow> {
    const [created] = await tx.insert(a).values(row).returning()
    if (created === undefined) throw new Error('chat attachment insert returned no row')
    return created
  }

  async find(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    attachmentId: string,
  ): Promise<ChatAttachmentRow | undefined> {
    const [row] = await tx
      .select()
      .from(a)
      .where(and(eq(a.organizationId, orgId), eq(a.chatId, chatId), eq(a.id, attachmentId)))
    return row
  }

  /** By id alone, for a job that knows the organization and the attachment. */
  async findById(
    tx: DbExecutor,
    orgId: string,
    attachmentId: string,
  ): Promise<ChatAttachmentRow | undefined> {
    const [row] = await tx
      .select()
      .from(a)
      .where(and(eq(a.organizationId, orgId), eq(a.id, attachmentId)))
    return row
  }

  async findMany(
    tx: DbExecutor,
    orgId: string,
    chatId: string,
    ids: readonly string[],
  ): Promise<ChatAttachmentRow[]> {
    if (ids.length === 0) return []
    return tx
      .select()
      .from(a)
      .where(and(eq(a.organizationId, orgId), eq(a.chatId, chatId), inArray(a.id, [...ids])))
  }

  /** The attachments of the given messages, for the model prompt. */
  async ofMessages(
    tx: DbExecutor,
    orgId: string,
    messageIds: readonly string[],
  ): Promise<ChatAttachmentRow[]> {
    if (messageIds.length === 0) return []
    return tx
      .select()
      .from(a)
      .where(and(eq(a.organizationId, orgId), inArray(a.messageId, [...messageIds])))
  }

  async update(
    tx: DbExecutor,
    orgId: string,
    attachmentId: string,
    patch: ChatAttachmentPatch,
  ): Promise<ChatAttachmentRow | undefined> {
    const [row] = await tx
      .update(a)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(a.organizationId, orgId), eq(a.id, attachmentId)))
      .returning()
    return row
  }

  /** Sets `message_id` on the attachments a message carries. */
  async link(
    tx: DbExecutor,
    orgId: string,
    attachmentIds: readonly string[],
    messageId: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) return
    await tx
      .update(a)
      .set({ messageId, updatedAt: new Date() })
      .where(and(eq(a.organizationId, orgId), inArray(a.id, [...attachmentIds])))
  }

  async delete(tx: DbExecutor, orgId: string, attachmentId: string): Promise<void> {
    await tx.delete(a).where(and(eq(a.organizationId, orgId), eq(a.id, attachmentId)))
  }

  // ── Cleanup (system scope) ──────────────────────────────────────────────────────────────────

  /** Attachments never sent with a message and older than `before`, oldest first. */
  unlinkedBefore(tx: DbExecutor, before: Date, limit: number) {
    return tx
      .select({ id: a.id, organizationId: a.organizationId, objectKey: a.objectKey })
      .from(a)
      .where(and(isNull(a.messageId), lt(a.createdAt, before)))
      .orderBy(a.createdAt)
      .limit(limit)
  }

  async deleteMany(tx: DbExecutor, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    await tx.delete(a).where(inArray(a.id, [...ids]))
  }

  /** Chats left with no message and no attachment, older than `before`: never stored for long. */
  async deleteEmptyChats(tx: DbExecutor, before: Date): Promise<number> {
    const rows = await tx
      .delete(chats)
      .where(
        and(
          eq(chats.messageCount, 0),
          lt(chats.createdAt, before),
          // qualified: a DELETE renders its own columns unqualified, which would bind to `x`
          sql`not exists (select 1 from chat_attachments x
                          where x.organization_id = chats.organization_id and x.chat_id = chats.id)`,
        ),
      )
      .returning({ id: chats.id })
    return rows.length
  }
}
