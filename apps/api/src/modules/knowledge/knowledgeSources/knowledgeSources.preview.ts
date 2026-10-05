// SPDX-License-Identifier: AGPL-3.0-only
import type { KnowledgeDocumentPageDto } from '@surefy/contracts'

import type { ParsedDocument } from '@/integrations/ml/index.js'

export interface PreviewChunk {
  id: string
  ordinal: number
  content: string
  pageFrom: number | null
}

/** How much of a passage's start is looked up in the page text to place it. */
const PROBE_CHARS = 80

/**
 * The extracted text by page, with the span of each passage that starts on it (the boundaries
 * shown on hover and focus). Sections and tables are grouped by page in reading order; a document
 * without pages is one page with `page: null`. A passage that cannot be found in its page's text
 * (the parser's output changed since it was indexed) has no span.
 */
export function buildPreviewPages(
  parsed: ParsedDocument,
  chunks: readonly PreviewChunk[],
): KnowledgeDocumentPageDto[] {
  const texts = new Map<number | null, string[]>()
  const add = (page: number | null, text: string) => {
    if (text.trim() === '') return
    texts.set(page, [...(texts.get(page) ?? []), text])
  }
  for (const section of parsed.sections) add(section.pageFrom, section.text.trim())
  for (const table of parsed.tables) {
    add(
      table.page,
      [table.caption, ...table.rows.map((row) => row.join(' | '))]
        .filter((line): line is string => line !== null)
        .join('\n'),
    )
  }
  const order = [...texts.keys()].sort((a, b) => (a ?? 0) - (b ?? 0))
  return order.map((page) => {
    const text = (texts.get(page) ?? []).join('\n\n')
    const passages = chunks
      .filter((chunk) => chunk.pageFrom === page)
      .flatMap((chunk) => {
        const start = text.indexOf(chunk.content.slice(0, PROBE_CHARS))
        if (start < 0) return []
        const end = Math.min(text.length, start + chunk.content.length)
        return [{ chunkId: chunk.id, ordinal: chunk.ordinal, start, end }]
      })
    return { page, text, passages }
  })
}
