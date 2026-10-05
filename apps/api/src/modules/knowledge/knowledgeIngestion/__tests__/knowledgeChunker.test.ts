// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { CHUNKING_PRESETS } from '../../knowledge.constants.js'
import { chunkDocument, embeddingInput, estimateTokens } from '../knowledgeChunker.js'

import type { ParsedDocument } from '@/integrations/ml/index.js'

const doc = (over: Partial<ParsedDocument>): ParsedDocument => ({
  title: null,
  language: null,
  pages: 1,
  sections: [],
  tables: [],
  usedOcr: false,
  ...over,
})

const section = (
  text: string,
  headingPath: string[] = [],
  pageFrom: number | null = 1,
  pageTo = pageFrom,
) => ({
  headingPath,
  text,
  pageFrom,
  pageTo,
})

const paragraph = (words: number, word = 'alpha') =>
  Array.from({ length: words }, () => word).join(' ')

const settings = CHUNKING_PRESETS.default

describe('chunkDocument', () => {
  it('returns nothing for an empty document', () => {
    expect(chunkDocument(doc({}), settings)).toEqual([])
    expect(chunkDocument(doc({ sections: [section('   \n\n  ')] }), settings)).toEqual([])
  })

  it('keeps a short section as one passage with its headings and pages', () => {
    const chunks = chunkDocument(
      doc({ sections: [section('Twenty days a year.', ['Leave', 'Annual'], 2, 3)] }),
      settings,
    )
    expect(chunks).toEqual([
      {
        ordinal: 0,
        content: 'Twenty days a year.',
        pageFrom: 2,
        pageTo: 3,
        headingPath: ['Leave', 'Annual'],
        tokenCount: estimateTokens('Twenty days a year.'),
      },
    ])
  })

  it('merges small neighbours with the same headings but never across headings', () => {
    const chunks = chunkDocument(
      doc({
        sections: [
          section('One.', ['A'], 1),
          section('Two.', ['A'], 2),
          section('Three.', ['B'], 2),
        ],
      }),
      settings,
    )
    expect(chunks.map((c) => c.content)).toEqual(['One.\n\nTwo.', 'Three.'])
    expect(chunks[0]).toMatchObject({ pageFrom: 1, pageTo: 2, headingPath: ['A'] })
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1])
  })

  it('splits a long section near the target, below the ceiling, with overlap', () => {
    // paragraphs of ~100 tokens each
    const paragraphs = Array.from(
      { length: 12 },
      (_, i) => 'p' + String(i) + ' ' + paragraph(98, 'w' + String(i)),
    )
    const chunks = chunkDocument(
      doc({ sections: [section(paragraphs.join('\n\n'), ['Long'])] }),
      settings,
    )
    expect(chunks.length).toBeGreaterThan(2)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(settings.maxTokens)
      expect(chunk.headingPath).toEqual(['Long'])
    }
    // the second passage starts with the paragraph that ended the first (overlap of 50 tokens fits none
    // of a 100-token paragraph, so the paragraph boundary is clean)
    const all = chunks.map((c) => c.content).join('\n\n')
    for (const p of paragraphs) expect(all).toContain(p)
  })

  it('repeats a trailing sentence at the start of the next passage when it fits the overlap', () => {
    const small = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i} says something useful.`,
    )
    const chunks = chunkDocument(doc({ sections: [section(small.join('\n\n'))] }), {
      ...settings,
      targetTokens: 100,
      maxTokens: 150,
      overlapTokens: 20,
    })
    expect(chunks.length).toBeGreaterThan(1)
    const first = chunks[0]?.content.split('\n\n') ?? []
    const second = chunks[1]?.content.split('\n\n') ?? []
    // two 10-token sentences fit the 20-token overlap
    expect(second.slice(0, 2)).toEqual(first.slice(-2))
  })

  it('splits a paragraph that is longer than the ceiling by sentences, then by characters', () => {
    const sentence = `${paragraph(20)}. `
    const chunks = chunkDocument(doc({ sections: [section(sentence.repeat(100))] }), settings)
    for (const chunk of chunks) expect(chunk.tokenCount).toBeLessThanOrEqual(settings.maxTokens)
    const blob = 'x'.repeat(settings.maxTokens * 4 * 3 + 10)
    const cut = chunkDocument(doc({ sections: [section(blob)] }), { ...settings, overlapTokens: 0 })
    expect(cut.length).toBeGreaterThanOrEqual(3)
    expect(cut.map((c) => c.content).join('')).toBe(blob)
  })

  it('starts a new passage at each question in the faqs preset', () => {
    const text = ['What is leave?', 'Twenty days.', 'How do I ask?', 'Use the form.'].join('\n\n')
    const chunks = chunkDocument(doc({ sections: [section(text)] }), CHUNKING_PRESETS.faqs)
    expect(chunks.map((c) => c.content)).toEqual([
      'What is leave?\n\nTwenty days.',
      'How do I ask?\n\nUse the form.',
    ])
  })

  it('chunks tables by rows and repeats the header row and caption', () => {
    const rows = [
      ['Name', 'Days'],
      ...Array.from({ length: 200 }, (_, i) => [`Employee ${i}`, `${i}`]),
    ]
    const chunks = chunkDocument(
      doc({ tables: [{ headingPath: ['Leave'], caption: 'Leave balances', rows, page: 4 }] }),
      settings,
    )
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.content.startsWith('Leave balances\nName | Days\n')).toBe(true)
      expect(chunk).toMatchObject({ pageFrom: 4, pageTo: 4, headingPath: ['Leave'] })
    }
    const all = chunks.map((c) => c.content).join('\n')
    expect(all).toContain('Employee 0 | 0')
    expect(all).toContain('Employee 199 | 199')
  })

  it('keeps a table that only has a header', () => {
    const chunks = chunkDocument(
      doc({ tables: [{ headingPath: [], caption: null, rows: [['A', 'B']], page: null }] }),
      settings,
    )
    expect(chunks.map((c) => c.content)).toEqual(['A | B'])
  })

  it('numbers passages from zero across sections and tables', () => {
    const chunks = chunkDocument(
      doc({
        sections: [section('First.', ['A']), section('Second.', ['B'])],
        tables: [{ headingPath: [], caption: null, rows: [['h'], ['v']], page: 1 }],
      }),
      settings,
    )
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2])
  })
})

describe('embeddingInput', () => {
  it('puts the headings above the passage', () => {
    expect(embeddingInput({ content: 'Twenty days.', headingPath: ['Leave', 'Annual'] })).toBe(
      'Leave > Annual\nTwenty days.',
    )
    expect(embeddingInput({ content: 'Twenty days.', headingPath: [] })).toBe('Twenty days.')
  })
})
