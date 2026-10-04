// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

import { modelKeySchema } from '../models/keys.js'

// `ChatMessageParts` v1 (`chat_messages.parts`, database/chat.md §4): the structured parts the
// thread renders, aligned with AI SDK UI message parts. Reasoning, tool calls and sources are
// separate parts, never concatenated into the answer text.

export const CHAT_PARTS_VERSION = 1
/** The serialized `parts` value is capped; tool outputs and snippets are truncated to fit. */
export const CHAT_PARTS_MAX_BYTES = 256 * 1024

export const textPartSchema = z.object({ type: z.literal('text'), text: z.string() })

export const reasoningPartSchema = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
})

export const TOOL_STATES = ['pending', 'done', 'error'] as const
export type ToolState = (typeof TOOL_STATES)[number]

export const toolPartSchema = z.object({
  type: z.literal('tool'),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  state: z.enum(TOOL_STATES),
  input: z.json(),
  /** Truncated to fit the parts cap. */
  output: z.json().optional(),
  errorCode: z.string().optional(),
})

export const SOURCE_KINDS = ['knowledge', 'web'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

/**
 * A numbered citation chip and its entry in the "Sources" list. Knowledge sources also become
 * `chat_message_citations` rows when the answer completes; web sources live only here. Ids are null
 * or absent once the cited document was purged: the chip keeps its title.
 */
export const sourcePartSchema = z.object({
  type: z.literal('source'),
  /** The chip number, 1-based; the same as the citation's `rank`. */
  index: z.number().int().min(1),
  kind: z.enum(SOURCE_KINDS),
  knowledgeBaseId: z.uuid().optional(),
  documentId: z.uuid().optional(),
  chunkId: z.uuid().optional(),
  page: z.number().int().min(1).optional(),
  url: z.url().optional(),
  title: z.string(),
  snippet: z.string(),
})
export type SourcePart = z.infer<typeof sourcePartSchema>

/** An attachment chip on a user message. */
export const filePartSchema = z.object({
  type: z.literal('file'),
  attachmentId: z.uuid(),
  mediaType: z.string().min(1),
  name: z.string().min(1),
})

export const modelSwitchPartSchema = z.object({
  type: z.literal('model-switch'),
  fromModelKey: modelKeySchema,
  toModelKey: modelKeySchema,
})

// ── Data parts: inline cards and notes ──────────────────────────────────────────────────────────

export const BUDGET_LIMIT_SCOPES = ['user', 'team', 'organization', 'credits'] as const
export type BudgetLimitScope = (typeof BUDGET_LIMIT_SCOPES)[number]

export const KNOWLEDGE_SKIPPED_REASONS = ['no_ready_sources', 'no_access'] as const
export type KnowledgeSkippedReason = (typeof KNOWLEDGE_SKIPPED_REASONS)[number]

/** "Stopped" marker with Continue. */
export const stoppedDataPartSchema = z.object({
  type: z.literal('data'),
  name: z.literal('stopped'),
  data: z.object({}),
})

/** "2 sources are still processing and weren't searched". */
export const sourcesProcessingDataPartSchema = z.object({
  type: z.literal('data'),
  name: z.literal('sources-processing'),
  data: z.object({ count: z.number().int().positive() }),
})

/** Knowledge was in scope but nothing could be searched. */
export const knowledgeSkippedDataPartSchema = z.object({
  type: z.literal('data'),
  name: z.literal('knowledge-skipped'),
  data: z.object({ reason: z.enum(KNOWLEDGE_SKIPPED_REASONS) }),
})

/** The inline card with "Use a local model" and "Ask an admin" / "Add credits". */
export const budgetReachedDataPartSchema = z.object({
  type: z.literal('data'),
  name: z.literal('budget-reached'),
  data: z.object({ scope: z.enum(BUDGET_LIMIT_SCOPES) }),
})

/** An agent action waiting for approval (V1); the thread updates it live from the approval. */
export const approvalDataPartSchema = z.object({
  type: z.literal('data'),
  name: z.literal('approval'),
  data: z.object({ approvalId: z.uuid() }),
})

export const CHAT_DATA_PART_NAMES = [
  'stopped',
  'sources-processing',
  'knowledge-skipped',
  'budget-reached',
  'approval',
] as const
export type ChatDataPartName = (typeof CHAT_DATA_PART_NAMES)[number]

export const dataPartSchema = z.discriminatedUnion('name', [
  stoppedDataPartSchema,
  sourcesProcessingDataPartSchema,
  knowledgeSkippedDataPartSchema,
  budgetReachedDataPartSchema,
  approvalDataPartSchema,
])
export type DataPart = z.infer<typeof dataPartSchema>

export const chatMessagePartSchema = z.union([
  textPartSchema,
  reasoningPartSchema,
  toolPartSchema,
  sourcePartSchema,
  filePartSchema,
  modelSwitchPartSchema,
  dataPartSchema,
])
export type ChatMessagePart = z.infer<typeof chatMessagePartSchema>

export const chatMessagePartsSchema = z.object({
  version: z.literal(CHAT_PARTS_VERSION),
  parts: z.array(chatMessagePartSchema),
})
export type ChatMessageParts = z.infer<typeof chatMessagePartsSchema>
