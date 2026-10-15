// SPDX-License-Identifier: AGPL-3.0-only
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_TYPES,
  CHAT_IMAGE_TYPES,
  CHAT_WEB_SEARCH_TOOL_NAME,
} from '@surefy/contracts'
import type { ChatMessageDto, ChatMessagePart, ChatUsage } from '@surefy/contracts'

import { SOURCE_HASH_PREFIX, THREAD_ERROR } from './ChatThread.constants'

import type {
  ThreadMessage,
  ThreadNote,
  ThreadPart,
  ThreadSource,
  ThreadUiMessage,
} from './ChatThread.types'

const FENCE = /(```[\s\S]*?```)/
const CITATION = /\[(\d{1,3})\]/g

/** History comes newest first (`-createdAt` pages); the thread reads oldest first. */
export function orderHistory(pages: readonly { items: readonly ChatMessageDto[] }[]) {
  return pages.flatMap((page) => page.items).toReversed()
}

/** The query of a web search step, when the step recorded one. */
function queryOf(toolName: string, input: unknown): { query?: string } {
  if (toolName !== CHAT_WEB_SEARCH_TOOL_NAME || typeof input !== 'object' || input === null) {
    return {}
  }
  const query = (input as { query?: unknown }).query
  return typeof query === 'string' ? { query } : {}
}

function partsOfDto(parts: readonly ChatMessagePart[]) {
  const visible: ThreadPart[] = []
  const sources: ThreadSource[] = []
  const notes: ThreadNote[] = []
  for (const part of parts) {
    switch (part.type) {
      case 'text':
        visible.push({ kind: 'text', text: part.text })
        break
      case 'reasoning':
        visible.push({
          kind: 'reasoning',
          text: part.text,
          durationMs: part.durationMs,
          isStreaming: false,
        })
        break
      case 'tool':
        visible.push({
          kind: 'tool',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          state: part.state,
          ...queryOf(part.toolName, part.input),
        })
        break
      case 'file':
        visible.push({
          kind: 'file',
          attachmentId: part.attachmentId,
          name: part.name,
          mediaType: part.mediaType,
        })
        break
      case 'model-switch':
        visible.push({
          kind: 'switch',
          fromModelKey: part.fromModelKey,
          toModelKey: part.toModelKey,
        })
        break
      case 'source':
        sources.push({
          index: part.index,
          kind: part.kind,
          title: part.title,
          page: part.page,
          url: part.url,
        })
        break
      case 'data':
        notes.push(
          part.name === 'approval'
            ? { name: 'approval', approvalId: part.data.approvalId }
            : ({ name: part.name, ...part.data } as ThreadNote),
        )
        break
    }
  }
  return { visible, sources: sources.toSorted((a, b) => a.index - b.index), notes }
}

/** A message from history, with everything the server stored. */
export function fromDto(message: ChatMessageDto): ThreadMessage {
  const { visible, sources, notes } = partsOfDto(message.parts.parts)
  return {
    id: message.id,
    role: message.role,
    status: message.status === 'superseded' ? 'complete' : message.status,
    parts: visible,
    sources,
    notes,
    modelKey: message.modelKey,
    dataLocation: message.dataLocation,
    piiMasked: message.piiMasked,
    errorCode: message.errorCode,
    feedback: message.feedback,
    variant: message.variant,
    usage: message.usage,
    isPersisted: true,
  }
}

/** The minimal copy of history `useChat` needs: ids and order, so triggers address real messages. */
export function toUiMessage(message: ChatMessageDto): ThreadUiMessage {
  const text = message.parts.parts.find((part) => part.type === 'text')?.text ?? ''
  return { id: message.id, role: message.role, parts: [{ type: 'text', text }] }
}

/** The number a source id ends with (`knowledge-2`), else the position it arrived in. */
const sourceIndexOf = (sourceId: string, fallback: number): number => {
  let digits = ''
  for (const char of sourceId.split('').toReversed()) {
    if (char < '0' || char > '9') break
    digits = char + digits
  }
  return digits === '' ? fallback : Number(digits)
}

function toolStateOf(state: string): 'pending' | 'done' | 'error' {
  if (state === 'output-available') return 'done'
  return state === 'output-error' ? 'error' : 'pending'
}

interface LiveParts {
  visible: ThreadPart[]
  sources: ThreadSource[]
  notes: ThreadNote[]
  modelKey: string | null
  dataLocation: ThreadMessage['dataLocation']
  piiMasked: boolean
  usage: ChatUsage | null
}

/** Adds one streamed part to what the message shows so far. */
function readLivePart(part: ThreadUiMessage['parts'][number], live: LiveParts): void {
  if (part.type === 'text') live.visible.push({ kind: 'text', text: part.text })
  else if (part.type === 'reasoning') {
    live.visible.push({
      kind: 'reasoning',
      text: part.text,
      isStreaming: part.state === 'streaming',
    })
  } else if (part.type === 'source-url') {
    const isWeb = part.sourceId.startsWith('web')
    live.sources.push({
      index: sourceIndexOf(part.sourceId, live.sources.length + 1),
      kind: isWeb ? 'web' : 'knowledge',
      title: part.title ?? part.url,
      url: isWeb ? part.url : undefined,
    })
  } else if (part.type === 'dynamic-tool') {
    live.visible.push({
      kind: 'tool',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      state: toolStateOf(part.state),
      ...queryOf(part.toolName, part.input),
    })
  } else if (part.type === 'data-approval-required') {
    live.notes.push({
      name: 'approval',
      approvalId: part.data.approvalId,
      title: part.data.title,
      assignees: part.data.assignees,
      expiresAt: part.data.expiresAt,
    })
  } else if (part.type === 'data-web-search-skipped') {
    live.notes.push({ name: 'web-search-skipped', reason: part.data.reason })
  } else if (part.type === 'data-usage') {
    live.usage = part.data
  } else if (part.type === 'data-model') {
    live.modelKey = part.data.model.modelKey
    live.dataLocation = part.data.dataLocation
    live.piiMasked = part.data.piiMasked
  }
}

/** A message that is only in memory: what is streaming now, or what was just sent. */
export function fromUi(message: ThreadUiMessage, isStreaming: boolean): ThreadMessage {
  const live: LiveParts = {
    visible: [],
    sources: [],
    notes: [],
    modelKey: null,
    dataLocation: null,
    piiMasked: false,
    usage: null,
  }
  for (const part of message.parts) readLivePart(part, live)
  for (const chip of message.metadata?.attachments ?? []) {
    live.visible.push({
      kind: 'file',
      attachmentId: chip.id,
      name: chip.name,
      mediaType: chip.mediaType,
    })
  }
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    status: isStreaming ? 'streaming' : 'complete',
    parts: live.visible,
    sources: live.sources,
    notes: live.notes,
    modelKey: live.modelKey,
    dataLocation: live.dataLocation,
    piiMasked: live.piiMasked,
    errorCode: null,
    feedback: null,
    variant: null,
    usage: live.usage,
    isPersisted: false,
  }
}

/** The second answer of a comparison while it is only in memory. */
export interface LiveComparison {
  message: ThreadUiMessage | undefined
  isStreaming: boolean
  /** The code the comparison request failed with. */
  errorCode: string | null
}

/**
 * History where it exists, the stream's own copy for what is still arriving. A live comparison adds
 * answer B after the live answers, and marks the answer it sits next to as A.
 */
export function buildRows(
  live: readonly ThreadUiMessage[],
  history: readonly ChatMessageDto[],
  isStreaming: boolean,
  stoppedId: string | null = null,
  comparison?: LiveComparison,
): ThreadMessage[] {
  const byId = new Map(history.map((message) => [message.id, message]))
  const liveIds = new Set(live.map((message) => message.id))
  const rows = live.map((message, position) => {
    const stored = byId.get(message.id)
    if (stored) return fromDto(stored)
    const row = fromUi(
      message,
      isStreaming && position === live.length - 1 && message.role === 'assistant',
    )
    return message.id === stoppedId ? { ...row, status: 'stopped' as const } : row
  })
  const answerB = comparison?.message
  if (answerB && !byId.has(answerB.id) && !liveIds.has(answerB.id)) {
    const answerA = rows.findLastIndex((row) => row.role === 'assistant')
    const row = fromUi(answerB, comparison.isStreaming)
    rows.splice(answerA + 1 || rows.length, 0, {
      ...row,
      status: comparison.errorCode && !comparison.isStreaming ? 'failed' : row.status,
      errorCode: comparison.errorCode,
      variant: { groupId: null, label: 'b' },
    })
    if (answerA !== -1) {
      const first = rows[answerA]
      if (first?.variant === null) {
        rows[answerA] = { ...first, variant: { groupId: null, label: 'a' } }
      }
    }
  }
  // Stored messages the stream does not hold yet (a failed answer the server recorded).
  const extra = history.filter((message) => !liveIds.has(message.id)).map(fromDto)
  return [...rows, ...extra]
}

/** What the thread lists: a message, or the two answers of a comparison side by side. */
export type ThreadItem =
  | { kind: 'message'; row: ThreadMessage }
  | { kind: 'comparison'; a: ThreadMessage; b: ThreadMessage }

/**
 * Answers A and B of an open comparison sit next to each other. An answer without its partner
 * (the other was not chosen, or has not arrived yet) is listed like any other message.
 */
export function groupComparisons(rows: readonly ThreadMessage[]): ThreadItem[] {
  const items: ThreadItem[] = []
  for (const [position, row] of rows.entries()) {
    const previous = rows[position - 1]
    const isPartner =
      row.variant?.label === 'b' &&
      previous?.variant?.label === 'a' &&
      previous.variant.groupId === row.variant.groupId
    if (isPartner) {
      items.pop()
      items.push({ kind: 'comparison', a: previous, b: row })
    } else items.push({ kind: 'message', row })
  }
  return items
}

export function getMessageText(message: Pick<ThreadMessage, 'parts'>): string {
  return message.parts
    .filter((part) => part.kind === 'text')
    .map((part) => part.text)
    .join('\n\n')
}

/**
 * Citation markers in an answer become links to `#source-<n>`, which the thread draws as chips and
 * opens in the preview. Only numbers that name a source are linked, and code is left alone.
 */
export function linkCitations(text: string, sources: readonly ThreadSource[]): string {
  if (sources.length === 0) return text
  const known = new Set(sources.map((source) => source.index))
  return text
    .split(FENCE)
    .map((segment, position) =>
      position % 2 === 1
        ? segment
        : segment.replaceAll(CITATION, (match, digits: string) =>
            known.has(Number(digits)) ? `[${digits}](${SOURCE_HASH_PREFIX}${digits})` : match,
          ),
    )
    .join('')
}

/** The number of a citation link's `href` (`#source-2`), or null for any other link. */
export function getCitationIndex(href: string | null | undefined): number | null {
  if (!href?.startsWith(SOURCE_HASH_PREFIX)) return null
  const index = Number(href.slice(SOURCE_HASH_PREFIX.length))
  return Number.isInteger(index) && index > 0 ? index : null
}

export function getAttachmentKind(mediaType: string): 'image' | 'document' {
  return (CHAT_IMAGE_TYPES as readonly string[]).includes(mediaType) ? 'image' : 'document'
}

/** The rule the API enforces, checked before anything is uploaded: null when the file is fine. */
export function validateAttachment(
  file: Pick<File, 'type' | 'size'>,
): 'CHAT_ATTACHMENT_UNSUPPORTED' | 'CHAT_ATTACHMENT_TOO_LARGE' | null {
  if (!(CHAT_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    return 'CHAT_ATTACHMENT_UNSUPPORTED'
  }
  const limit =
    getAttachmentKind(file.type) === 'image'
      ? CHAT_ATTACHMENT_LIMITS.maxImageBytes
      : CHAT_ATTACHMENT_LIMITS.maxDocumentBytes
  return file.size > limit ? 'CHAT_ATTACHMENT_TOO_LARGE' : null
}

export type FailureKind =
  'budget' | 'credits' | 'rate-limit' | 'not-allowed' | 'unavailable' | 'generic'

/** Which inline card an answer's error code gets. */
export function getFailureKind(code: string | null): FailureKind {
  switch (code) {
    case THREAD_ERROR.BUDGET_EXCEEDED:
      return 'budget'
    case THREAD_ERROR.CREDITS_EXHAUSTED:
      return 'credits'
    case THREAD_ERROR.RATE_LIMITED:
      return 'rate-limit'
    case THREAD_ERROR.MODEL_NOT_ALLOWED:
      return 'not-allowed'
    case THREAD_ERROR.PROVIDER_UNAVAILABLE:
      return 'unavailable'
    default:
      return 'generic'
  }
}

/**
 * The code of a failed request: the stream's `error` chunk carries it as `errorText`; a failure
 * before the first byte arrives as the API's error envelope in the message.
 */
export function getErrorCode(error: Error | undefined): string | null {
  if (!error) return null
  if (/^[A-Z][A-Z_]+$/.test(error.message)) return error.message
  try {
    const body = JSON.parse(error.message) as { error?: { code?: unknown } }
    return typeof body.error?.code === 'string' ? body.error.code : null
  } catch {
    return null
  }
}
