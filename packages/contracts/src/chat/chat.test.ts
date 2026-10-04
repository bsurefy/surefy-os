// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_DATA_PART_NAMES,
  chatMessagePartsSchema,
  chatStreamDataSchemas,
  createChatFolderInputSchema,
  listChatsQuerySchema,
  requestChatAttachmentUploadInputSchema,
  sendChatMessageInputSchema,
  setChatFeedbackInputSchema,
  updateChatInputSchema,
} from '../index.js'

const id = '0190a5c4-0000-7000-8000-000000000001'
const id2 = '0190a5c4-0000-7000-8000-000000000002'

describe('chat message parts', () => {
  it('accepts every part type of ChatMessageParts v1', () => {
    const result = chatMessagePartsSchema.safeParse({
      version: 1,
      parts: [
        { type: 'text', text: 'Revenue grew [1].' },
        { type: 'reasoning', text: 'Checking the report', durationMs: 1200 },
        {
          type: 'tool',
          toolCallId: 'call_1',
          toolName: 'search',
          state: 'done',
          input: { q: 'revenue' },
          output: { hits: 3 },
        },
        {
          type: 'source',
          index: 1,
          kind: 'knowledge',
          knowledgeBaseId: id,
          documentId: id2,
          page: 4,
          title: 'Q3 report',
          snippet: 'Revenue grew 12%',
        },
        {
          type: 'source',
          index: 2,
          kind: 'web',
          url: 'https://example.com/a',
          title: 'A',
          snippet: '',
        },
        { type: 'file', attachmentId: id, mediaType: 'image/png', name: 'chart.png' },
        { type: 'model-switch', fromModelKey: 'openai/gpt-4.1', toModelKey: 'local/x/llama3' },
        { type: 'data', name: 'sources-processing', data: { count: 2 } },
        { type: 'data', name: 'stopped', data: {} },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown part types, wrong versions and malformed data parts', () => {
    expect(chatMessagePartsSchema.safeParse({ version: 2, parts: [] }).success).toBe(false)
    expect(
      chatMessagePartsSchema.safeParse({ version: 1, parts: [{ type: 'image', url: 'x' }] })
        .success,
    ).toBe(false)
    expect(
      chatMessagePartsSchema.safeParse({
        version: 1,
        parts: [{ type: 'data', name: 'sources-processing', data: { count: 0 } }],
      }).success,
    ).toBe(false)
    expect(
      chatMessagePartsSchema.safeParse({
        version: 1,
        parts: [{ type: 'source', index: 0, kind: 'web', title: 'A', snippet: '' }],
      }).success,
    ).toBe(false)
  })

  it('names the persisted data parts the thread renders', () => {
    expect(CHAT_DATA_PART_NAMES).toContain('budget-reached')
    expect(
      chatMessagePartsSchema.safeParse({
        version: 1,
        parts: [{ type: 'data', name: 'budget-reached', data: { scope: 'team' } }],
      }).success,
    ).toBe(true)
  })
})

describe('sending messages', () => {
  it('checks the fields each trigger needs', () => {
    expect(sendChatMessageInputSchema.parse({ trigger: 'submit', text: ' Hello ' })).toEqual({
      trigger: 'submit',
      text: 'Hello',
      attachmentIds: [],
    })
    expect(sendChatMessageInputSchema.safeParse({ trigger: 'submit', text: '  ' }).success).toBe(
      false,
    )
    expect(sendChatMessageInputSchema.safeParse({ trigger: 'regenerate' }).success).toBe(false)
    expect(
      sendChatMessageInputSchema.safeParse({ trigger: 'regenerate', messageId: id }).success,
    ).toBe(true)
    expect(sendChatMessageInputSchema.safeParse({ trigger: 'edit', messageId: id }).success).toBe(
      false,
    )
    expect(
      sendChatMessageInputSchema.safeParse({ trigger: 'continue', messageId: id }).success,
    ).toBe(true)
    expect(sendChatMessageInputSchema.safeParse({ trigger: 'delete', messageId: id }).success).toBe(
      false,
    )
  })

  it('accepts new-chat settings on the first message and caps the attachments', () => {
    expect(
      sendChatMessageInputSchema.safeParse({
        trigger: 'submit',
        text: 'Hi',
        newChat: { isPrivate: true, knowledgeScope: 'selected', knowledgeBaseIds: [id] },
      }).success,
    ).toBe(true)
    expect(
      sendChatMessageInputSchema.safeParse({
        trigger: 'submit',
        text: 'Hi',
        attachmentIds: Array.from({ length: 11 }, () => id),
      }).success,
    ).toBe(false)
  })

  it('describes the SurefyOS stream chunks', () => {
    expect(
      chatStreamDataSchemas.message.safeParse({ userMessageId: null, assistantMessageId: id })
        .success,
    ).toBe(true)
    expect(chatStreamDataSchemas.title.safeParse({ title: 'Q3 numbers' }).success).toBe(true)
    expect(
      chatStreamDataSchemas.usage.safeParse({
        inputTokens: 10,
        outputTokens: 20,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        costMicros: 120,
        currency: 'USD',
        firstTokenMs: 300,
        latencyMs: 1500,
      }).success,
    ).toBe(true)
  })
})

describe('chat lists and updates', () => {
  it('lists active chats by default and accepts the folder, pin and search filters', () => {
    expect(listChatsQuerySchema.parse({}).state).toBe('active')
    expect(
      listChatsQuerySchema.parse({ folderId: 'none', isPinned: 'true', q: 'budget' }),
    ).toMatchObject({ folderId: 'none', isPinned: true, q: 'budget' })
    expect(listChatsQuerySchema.safeParse({ folderId: 'inbox' }).success).toBe(false)
    expect(listChatsQuerySchema.safeParse({ state: 'deleted', sort: '-deletedAt' }).success).toBe(
      true,
    )
    expect(listChatsQuerySchema.safeParse({ sort: 'title' }).success).toBe(false)
  })

  it('updates part of a chat and rejects an empty title', () => {
    expect(updateChatInputSchema.parse({ isPinned: true, folderId: null })).toEqual({
      isPinned: true,
      folderId: null,
    })
    expect(updateChatInputSchema.safeParse({ title: ' ' }).success).toBe(false)
    expect(updateChatInputSchema.safeParse({ knowledgeScope: 'everything' }).success).toBe(false)
  })

  it('names folders and rates answers', () => {
    expect(createChatFolderInputSchema.safeParse({ name: ' Work ' })).toMatchObject({
      success: true,
      data: { name: 'Work' },
    })
    expect(createChatFolderInputSchema.safeParse({ name: '' }).success).toBe(false)
    expect(
      setChatFeedbackInputSchema.safeParse({ rating: 'not_helpful', correctionText: 'Cite 2024' })
        .success,
    ).toBe(true)
    expect(setChatFeedbackInputSchema.safeParse({ rating: 'great' }).success).toBe(false)
  })
})

describe('attachments', () => {
  it('accepts a supported type within the size limit', () => {
    expect(
      requestChatAttachmentUploadInputSchema.safeParse({
        fileName: 'plan.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
      }).success,
    ).toBe(true)
  })

  it('rejects unsupported types and files over the largest limit', () => {
    expect(
      requestChatAttachmentUploadInputSchema.safeParse({
        fileName: 'run.exe',
        contentType: 'application/x-msdownload',
        sizeBytes: 10,
      }).success,
    ).toBe(false)
    expect(
      requestChatAttachmentUploadInputSchema.safeParse({
        fileName: 'big.pdf',
        contentType: 'application/pdf',
        sizeBytes: CHAT_ATTACHMENT_LIMITS.maxDocumentBytes + 1,
      }).success,
    ).toBe(false)
  })
})
