// SPDX-License-Identifier: AGPL-3.0-only
import { CONTINUE_PROMPT, PROMPT_ATTACHMENT_MAX_CHARS } from './chats.constants.js'

import type { ChatAttachmentRow, ChatMessageRow } from './chats.mapper.js'
import type { ModelMessage } from 'ai'

type UserPart = { type: 'text'; text: string } | { type: 'image'; image: Buffer; mediaType: string }

export interface PromptInput {
  /** The conversation so far, oldest first, without superseded messages. */
  history: readonly ChatMessageRow[]
  attachmentsByMessage: ReadonlyMap<string, readonly ChatAttachmentRow[]>
  supportsVision: boolean
  /** Reads an image attachment's bytes. */
  readImage: (attachment: ChatAttachmentRow) => Promise<Buffer>
  /** Continue a stopped answer: the model is asked to carry on where it stopped. */
  continuing: boolean
}

const documentBlock = (attachment: ChatAttachmentRow): string =>
  `[Attachment: ${attachment.fileName}]\n${(attachment.extractedText ?? '').slice(0, PROMPT_ATTACHMENT_MAX_CHARS)}`

/** The parts of one user message: its text, documents inlined, images when the model reads them. */
async function userParts(message: ChatMessageRow, input: PromptInput): Promise<UserPart[]> {
  const parts: UserPart[] = []
  if (message.contentText !== '') parts.push({ type: 'text', text: message.contentText })
  for (const attachment of input.attachmentsByMessage.get(message.id) ?? []) {
    if (attachment.kind === 'document') {
      parts.push({ type: 'text', text: documentBlock(attachment) })
    } else if (input.supportsVision) {
      parts.push({
        type: 'image',
        image: await input.readImage(attachment),
        mediaType: attachment.contentType,
      })
    } else {
      parts.push({ type: 'text', text: `[Image: ${attachment.fileName}, not shown to this model]` })
    }
  }
  return parts
}

interface Turn {
  role: 'user' | 'assistant'
  parts: UserPart[]
}

/** Joins messages of one role that ended up next to each other (some providers refuse them). */
function append(turns: Turn[], role: Turn['role'], parts: UserPart[]): void {
  if (parts.length === 0) return
  const last = turns.at(-1)
  if (last?.role === role) last.parts.push(...parts)
  else turns.push({ role, parts })
}

/**
 * The messages the model sees. Documents are inlined as text; images go as image parts only when
 * the model reads them (after a switch to a model that does not, earlier images are noted).
 * A failed answer in between would leave two messages of one role next to each other, so those
 * are joined.
 */
export async function buildModelMessages(input: PromptInput): Promise<ModelMessage[]> {
  const turns: Turn[] = []
  for (const message of input.history) {
    if (message.role === 'assistant') {
      if (message.contentText !== '') {
        append(turns, 'assistant', [{ type: 'text', text: message.contentText }])
      }
    } else {
      append(turns, 'user', await userParts(message, input))
    }
  }
  if (input.continuing) append(turns, 'user', [{ type: 'text', text: CONTINUE_PROMPT }])
  return turns.map(({ role, parts }): ModelMessage => {
    if (role === 'user') return { role, content: parts }
    return {
      role,
      content: parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n\n'),
    }
  })
}
