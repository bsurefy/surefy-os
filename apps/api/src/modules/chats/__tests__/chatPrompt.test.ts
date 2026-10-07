// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { buildModelMessages } from '../chatPrompt.js'
import { CONTINUE_PROMPT } from '../chats.constants.js'
import { emptyParts } from '../chats.utils.js'

import type { ChatAttachmentRow, ChatMessageRow } from '../chats.mapper.js'

let counter = 0
const message = (role: 'user' | 'assistant', contentText: string): ChatMessageRow =>
  ({
    id: `m${String(++counter)}`,
    role,
    contentText,
    status: 'complete',
    parts: emptyParts(),
  }) as ChatMessageRow

const attachment = (over: Partial<ChatAttachmentRow>): ChatAttachmentRow =>
  ({
    id: 'a1',
    fileName: 'file',
    contentType: 'text/plain',
    kind: 'document',
    extractedText: null,
    ...over,
  }) as ChatAttachmentRow

const build = (
  history: ChatMessageRow[],
  options: {
    attachments?: Record<string, ChatAttachmentRow[]>
    supportsVision?: boolean
    continuing?: boolean
  } = {},
) =>
  buildModelMessages({
    history,
    attachmentsByMessage: new Map(Object.entries(options.attachments ?? {})),
    supportsVision: options.supportsVision ?? false,
    continuing: options.continuing ?? false,
    readImage: () => Promise.resolve(Buffer.from('png-bytes')),
  })

describe('buildModelMessages', () => {
  it('maps the conversation to model messages', async () => {
    expect(
      await build([message('user', 'Hi'), message('assistant', 'Hello'), message('user', 'Bye')]),
    ).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: [{ type: 'text', text: 'Bye' }] },
    ])
  })

  it('joins messages of one role left next to each other by a failed answer', async () => {
    const result = await build([
      message('user', 'One'),
      message('assistant', ''),
      message('user', 'Two'),
    ])
    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'One' },
          { type: 'text', text: 'Two' },
        ],
      },
    ])
  })

  it('inlines documents, and passes images only to models that read them', async () => {
    const question = message('user', 'What is in these?')
    const files = {
      [question.id]: [
        attachment({ id: 'd', fileName: 'notes.txt', extractedText: 'Annual plans: 14 days.' }),
        attachment({ id: 'i', fileName: 'chart.png', kind: 'image', contentType: 'image/png' }),
      ],
    }
    const blind = await build([question], { attachments: files })
    expect(JSON.stringify(blind)).toContain('[Attachment: notes.txt]\\nAnnual plans: 14 days.')
    expect(JSON.stringify(blind)).toContain('[Image: chart.png, not shown to this model]')
    const sighted = await build([question], { attachments: files, supportsVision: true })
    const content = (sighted[0] as { content: { type: string; mediaType?: string }[] }).content
    expect(content.at(-1)).toMatchObject({ type: 'image', mediaType: 'image/png' })
  })

  it('asks the model to carry on when continuing a stopped answer', async () => {
    const result = await build([message('user', 'Story'), message('assistant', 'Once upon')], {
      continuing: true,
    })
    expect(result.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'text', text: CONTINUE_PROMPT }],
    })
  })
})
