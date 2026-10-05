// SPDX-License-Identifier: AGPL-3.0-only
import { QUEUES } from '@/constants/queues.js'
import type { KnowledgeChunkingPreset } from '@surefy/contracts'

/** Queue jobs of the knowledge module (`knowledge-ingestion` queue, ingestion status flow). */
export const KNOWLEDGE_JOBS = {
  INGEST_DOCUMENT: 'ingestDocument',
  SYNC_SOURCE: 'syncSource',
  REEMBED_BASE: 'reembedKnowledgeBase',
  SCHEDULE_SYNCS: 'scheduleKnowledgeSyncs',
} as const

/** Target and ceiling of a passage in tokens, and the tail repeated at the start of the next one. */
export interface ChunkingSettings {
  targetTokens: number
  maxTokens: number
  overlapTokens: number
  /** FAQ documents: a paragraph that ends with a question mark starts a new passage. */
  splitOnQuestions: boolean
}

export const CHUNKING_PRESETS: Record<KnowledgeChunkingPreset, ChunkingSettings> = {
  default: { targetTokens: 400, maxTokens: 600, overlapTokens: 50, splitOnQuestions: false },
  long_documents: {
    targetTokens: 800,
    maxTokens: 1200,
    overlapTokens: 100,
    splitOnQuestions: false,
  },
  faqs: { targetTokens: 200, maxTokens: 350, overlapTokens: 0, splitOnQuestions: true },
}

/** Passages embedded per gateway call; progress advances per batch. */
export const EMBED_BATCH_SIZE = 64

/** Parsing takes up to this share of a file's processing progress, embedding the rest. */
export const PARSE_PROGRESS_PERCENT = 30

/** A rough measure that needs no tokenizer: four characters per token. */
export const CHARS_PER_TOKEN = 4

/** The scheduler of due link syncs, registered with the other system schedulers. */
export const KNOWLEDGE_SCHEDULER = {
  id: 'knowledge-sync',
  queue: QUEUES.KNOWLEDGE_INGESTION,
  repeat: { every: 5 * 60_000 },
  job: { name: KNOWLEDGE_JOBS.SCHEDULE_SYNCS },
} as const
