// SPDX-License-Identifier: AGPL-3.0-only
import type { KnowledgeBaseDto, KnowledgeSourceDto } from '@surefy/contracts'

import { BASE_SORTS, DEFAULT_KNOWLEDGE_TAB, KNOWLEDGE_TABS } from './Knowledge.constants'

import type { BaseFilter, BaseSort, KnowledgeTab } from './Knowledge.constants'
import type { KnowledgeBaseListFilters } from '@/api/knowledge'

const DAY_MS = 24 * 60 * 60 * 1000

/** The tab named by the route; an unknown name shows the first tab. */
export function getKnowledgeTab(tab: string | undefined): KnowledgeTab {
  return KNOWLEDGE_TABS.find((value) => value === tab) ?? DEFAULT_KNOWLEDGE_TAB
}

/** The list filter as the query the API understands. */
export function toBaseListFilter(
  filter: BaseFilter,
): Pick<KnowledgeBaseListFilters, 'isLocalOnly' | 'needsAttention'> {
  if (filter === 'attention') return { needsAttention: true }
  if (filter === 'local') return { isLocalOnly: true }
  return {}
}

/** Whole days until a deleted item is removed for good; never below 0. */
export function getDaysLeft(purgeAt: string | null, now: Date): number {
  if (!purgeAt) return 0
  return Math.max(0, Math.ceil((new Date(purgeAt).getTime() - now.getTime()) / DAY_MS))
}

export type BaseStatus =
  | { kind: 'reindexing'; percent: number }
  | { kind: 'processing'; count: number; percent: number }
  | { kind: 'attention'; count: number }
  | { kind: 'empty' }
  | { kind: 'ready' }

/** What the list's status column says about a base, most pressing first. */
export function getBaseStatus(base: KnowledgeBaseDto): BaseStatus {
  if (base.reindex) {
    const { documentsDone, documentsTotal } = base.reindex
    return {
      kind: 'reindexing',
      percent: documentsTotal > 0 ? Math.round((documentsDone / documentsTotal) * 100) : 0,
    }
  }
  if (base.processing.inProgress > 0) {
    return {
      kind: 'processing',
      count: base.processing.inProgress,
      percent: base.processing.progressPercent,
    }
  }
  if (base.processing.needsAttention > 0) {
    return { kind: 'attention', count: base.processing.needsAttention }
  }
  return base.sourceCount === 0 ? { kind: 'empty' } : { kind: 'ready' }
}

const ATTENTION_STATUSES = new Set(['partially_failed', 'failed', 'paused'])
const IN_PROGRESS_STATUSES = new Set(['uploading', 'queued', 'processing'])

export const isSourceInProgress = (source: Pick<KnowledgeSourceDto, 'status'>) =>
  IN_PROGRESS_STATUSES.has(source.status)

export const sourceNeedsAttention = (source: Pick<KnowledgeSourceDto, 'status'>) =>
  ATTENTION_STATUSES.has(source.status)

/** Whether the caller may change this base: `manage` shows the write actions, `search` the read-only view. */
export const canManageBase = (base: Pick<KnowledgeBaseDto, 'effectiveLevel'>) =>
  base.effectiveLevel === 'manage'

/** The list sort for a table column and direction; anything else sorts by name. */
export function toBaseSort(id: string, isDescending: boolean): BaseSort {
  const wanted = isDescending ? `-${id}` : id
  return BASE_SORTS.find((value) => value === wanted) ?? 'name'
}

export interface TextSegment {
  text: string
  /** Set on the text of a passage: its position in the document (from 0). */
  passageOrdinal: number | null
}

/**
 * Splits a page's text at the passage boundaries, so the preview can mark each passage on hover
 * and focus. Spans are clamped to the text and overlaps are cut, so the pieces always join back
 * into the original text.
 */
export function splitPassages(
  text: string,
  passages: readonly { ordinal: number; start: number; end: number }[],
): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0
  for (const passage of [...passages].sort((a, b) => a.start - b.start)) {
    const start = Math.max(passage.start, cursor)
    const end = Math.min(passage.end, text.length)
    if (end <= start) continue
    if (start > cursor) segments.push({ text: text.slice(cursor, start), passageOrdinal: null })
    segments.push({ text: text.slice(start, end), passageOrdinal: passage.ordinal })
    cursor = end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), passageOrdinal: null })
  return segments
}
