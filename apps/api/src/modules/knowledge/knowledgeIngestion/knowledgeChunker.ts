// SPDX-License-Identifier: AGPL-3.0-only
import { CHARS_PER_TOKEN, type ChunkingSettings } from '../knowledge.constants.js'

import type { DocumentSection, DocumentTable, ParsedDocument } from '@/integrations/ml/index.js'

/** One passage ready to embed and store. */
export interface Chunk {
  ordinal: number
  content: string
  pageFrom: number | null
  pageTo: number | null
  headingPath: string[]
  tokenCount: number
}

export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN)

/** What is embedded: the passage under its headings, so "Annual leave" finds its own section. */
export const embeddingInput = (chunk: Pick<Chunk, 'content' | 'headingPath'>): string =>
  chunk.headingPath.length === 0
    ? chunk.content
    : `${chunk.headingPath.join(' > ')}\n${chunk.content}`

/** A piece of text that is never cut further than a sentence or, last, a run of characters. */
interface Unit {
  text: string
  tokens: number
  startsPassage: boolean
}

interface Draft {
  units: Unit[]
  tokens: number
  pageFrom: number | null
  pageTo: number | null
  headingPath: string[]
}

const sameHeadings = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((heading, index) => heading === b[index])

const SENTENCE_END = new Set(['.', '!', '?'])

/** Sentences end at `.`, `!` or `?` followed by white space, or at a line break; endings stay. */
function sentences(paragraph: string): string[] {
  const parts: string[] = []
  let start = 0
  for (let at = 0; at < paragraph.length; at += 1) {
    const char = paragraph.charAt(at)
    const next = paragraph.charAt(at + 1)
    const endsSentence = SENTENCE_END.has(char) && (next === '' || /\s/.test(next))
    if (endsSentence || char === '\n') {
      parts.push(paragraph.slice(start, at + 1))
      start = at + 1
    }
  }
  parts.push(paragraph.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

/** Cuts text that has no sentence ends (a long row of numbers, minified HTML) into runs. */
function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = []
  for (let at = 0; at < text.length; at += maxChars) parts.push(text.slice(at, at + maxChars))
  return parts
}

function pieces(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph]
  return sentences(paragraph).flatMap((s) => (s.length <= maxChars ? [s] : hardSplit(s, maxChars)))
}

function toUnits(text: string, settings: ChunkingSettings): Unit[] {
  const maxChars = settings.maxTokens * CHARS_PER_TOKEN
  const units: Unit[] = []
  for (const paragraph of text.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim()
    if (trimmed === '') continue
    const isQuestion = settings.splitOnQuestions && trimmed.endsWith('?')
    for (const [index, piece] of pieces(trimmed, maxChars).entries()) {
      units.push({
        text: piece,
        tokens: estimateTokens(piece),
        startsPassage: isQuestion && index === 0,
      })
    }
  }
  return units
}

const minPage = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? (a ?? b) : Math.min(a, b)
const maxPage = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? (a ?? b) : Math.max(a, b)

/** The units at the end of a passage that fit the overlap, to open the next one with. */
function overlapTail(previous: Draft, overlapTokens: number): Unit[] {
  const tail: Unit[] = []
  let carried = 0
  for (let i = previous.units.length - 1; i >= 0; i -= 1) {
    const unit = previous.units[i]
    if (unit === undefined || carried + unit.tokens > overlapTokens) break
    tail.unshift(unit)
    carried += unit.tokens
  }
  return tail
}

/** Collects sections into passages: one heading path each, grown up to the target. */
class DraftBuilder {
  readonly drafts: Draft[] = []
  private open: Draft | undefined

  constructor(private readonly settings: ChunkingSettings) {}

  add(section: DocumentSection): void {
    const units = toUnits(section.text, this.settings)
    if (units.length === 0) return
    if (this.open !== undefined && !sameHeadings(this.open.headingPath, section.headingPath)) {
      this.close()
    }
    for (const unit of units) {
      if (this.mustCutBefore(unit)) this.cut(section.headingPath, unit)
      const draft = (this.open ??= this.empty(section.headingPath))
      draft.units.push(unit)
      draft.tokens += unit.tokens
      draft.pageFrom = minPage(draft.pageFrom, section.pageFrom)
      draft.pageTo = maxPage(draft.pageTo, section.pageTo ?? section.pageFrom)
    }
  }

  finish(): Draft[] {
    this.close()
    return this.drafts
  }

  private mustCutBefore(unit: Unit): boolean {
    const draft = this.open
    if (draft === undefined || draft.units.length === 0) return false
    return unit.startsPassage || draft.tokens + unit.tokens > this.settings.targetTokens
  }

  /** Closes the open passage and opens the next with the tail of the one before it. */
  private cut(headingPath: string[], next: Unit): void {
    const previous = this.open
    this.close()
    const draft = this.empty(headingPath)
    if (previous !== undefined && !next.startsPassage) {
      draft.units = overlapTail(previous, this.settings.overlapTokens)
      draft.tokens = draft.units.reduce((sum, unit) => sum + unit.tokens, 0)
    }
    this.open = draft
  }

  private close(): void {
    if (this.open !== undefined && this.open.units.length > 0) this.drafts.push(this.open)
    this.open = undefined
  }

  private empty(headingPath: string[]): Draft {
    return { units: [], tokens: 0, pageFrom: null, pageTo: null, headingPath }
  }
}

/** Rows as `a | b | c` lines, the first row repeated at the top of every passage of the table. */
function chunkTable(table: DocumentTable, settings: ChunkingSettings): Chunk[] {
  const rows = table.rows.map((row) => row.join(' | ')).filter((row) => row.trim() !== '')
  const [header, ...body] = rows
  if (header === undefined) return []
  const lead = table.caption === null ? [header] : [table.caption, header]
  const leadTokens = estimateTokens(lead.join('\n'))
  const maxChars = settings.maxTokens * CHARS_PER_TOKEN
  const chunks: Chunk[] = []
  const push = (lines: string[]) => {
    const content = lines.join('\n')
    chunks.push({
      ordinal: 0,
      content,
      pageFrom: table.page,
      pageTo: table.page,
      headingPath: table.headingPath,
      tokenCount: estimateTokens(content),
    })
  }
  if (body.length === 0) {
    push(lead)
    return chunks
  }
  let current: string[] = []
  let tokens = leadTokens
  const flush = () => {
    if (current.length === 0) return
    push([...lead, ...current])
    current = []
    tokens = leadTokens
  }
  for (const row of body.flatMap((r) => (r.length > maxChars ? hardSplit(r, maxChars) : [r]))) {
    const cost = estimateTokens(row)
    if (current.length > 0 && tokens + cost > settings.targetTokens) flush()
    current.push(row)
    tokens += cost
  }
  flush()
  return chunks
}

/**
 * Structure-aware splitting (ai-architecture.md, §4): a passage stays inside one heading path,
 * grows paragraph by paragraph up to the target, never passes the ceiling, and a passage cut from
 * a longer section starts with the tail of the one before it. Small neighbouring sections with
 * the same headings share a passage. Tables are cut by rows with the header row repeated.
 */
export function chunkDocument(document: ParsedDocument, settings: ChunkingSettings): Chunk[] {
  const builder = new DraftBuilder(settings)
  for (const section of document.sections) builder.add(section)
  const chunks: Chunk[] = builder.finish().map((draft) => ({
    ordinal: 0,
    content: draft.units.map((unit) => unit.text).join('\n\n'),
    pageFrom: draft.pageFrom,
    pageTo: draft.pageTo,
    headingPath: draft.headingPath,
    tokenCount: draft.tokens,
  }))
  for (const table of document.tables) chunks.push(...chunkTable(table, settings))
  return chunks
    .filter((chunk) => chunk.content.trim() !== '')
    .map((chunk, ordinal) => ({ ...chunk, ordinal, tokenCount: estimateTokens(chunk.content) }))
}
