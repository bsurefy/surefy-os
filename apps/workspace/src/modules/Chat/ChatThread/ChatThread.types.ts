// SPDX-License-Identifier: AGPL-3.0-only
import type {
  BudgetLimitScope,
  ChatFeedbackDto,
  ChatMessageIdsData,
  ChatModelData,
  ChatUsage,
  DataLocation,
  KnowledgeSkippedReason,
  ToolState,
} from '@surefy/contracts'

import type { UIMessage } from 'ai'

/** What the composer remembers about a file added to the message. */
export interface AttachmentChip {
  id: string
  name: string
  mediaType: string
}

/** Carried on the person's message while it is only in memory. */
export interface ThreadMessageMetadata {
  attachments?: AttachmentChip[]
}

interface DataPartMap {
  message: ChatMessageIdsData
  model: ChatModelData
  usage: ChatUsage
  title: { title: string }
}

/** The SurefyOS data chunks of the stream (`data-<name>`), typed for `useChat`. */
export type ThreadDataParts = { [Name in keyof DataPartMap]: DataPartMap[Name] }

export type ThreadUiMessage = UIMessage<ThreadMessageMetadata, ThreadDataParts>

/** A numbered citation chip and its entry in the "Sources" list. */
export interface ThreadSource {
  index: number
  kind: 'knowledge' | 'web'
  title: string
  page?: number
  url?: string
}

/** The notes and cards under an answer, from the `data` parts. */
export type ThreadNote =
  | { name: 'stopped' }
  | { name: 'sources-processing'; count: number }
  | { name: 'knowledge-skipped'; reason: KnowledgeSkippedReason }
  | { name: 'budget-reached'; scope: BudgetLimitScope }

export type ThreadPart =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string; durationMs?: number; isStreaming: boolean }
  | { kind: 'tool'; toolCallId: string; toolName: string; state: ToolState }
  | { kind: 'file'; attachmentId: string; name: string; mediaType: string }
  | { kind: 'switch'; fromModelKey: string; toModelKey: string }

export type ThreadMessageStatus = 'streaming' | 'complete' | 'stopped' | 'interrupted' | 'failed'

/** One message as the thread draws it, whether it came from history or from the stream. */
export interface ThreadMessage {
  id: string
  role: 'user' | 'assistant'
  status: ThreadMessageStatus
  parts: ThreadPart[]
  sources: ThreadSource[]
  notes: ThreadNote[]
  modelKey: string | null
  dataLocation: DataLocation | null
  piiMasked: boolean
  errorCode: string | null
  feedback: ChatFeedbackDto | null
  /** Only history has full detail (sources with ids, feedback, usage). */
  isPersisted: boolean
}

/** What the thread is doing, for the composer and the inline notices. */
export type ThreadActivity = 'idle' | 'submitted' | 'streaming'

/** An attachment on its way to the message, with the progress the composer shows per file. */
export interface PendingAttachment {
  /** Local key until the server assigns the attachment id. */
  key: string
  id: string | null
  file: File
  name: string
  mediaType: string
  kind: 'image' | 'document'
  status: 'uploading' | 'ready' | 'failed'
  progress: number
  errorCode: string | null
}
