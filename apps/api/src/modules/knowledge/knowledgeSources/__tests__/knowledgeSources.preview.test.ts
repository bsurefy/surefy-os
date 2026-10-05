// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { buildPreviewPages } from '../knowledgeSources.preview.js'

import type { ParsedDocument } from '@/integrations/ml/index.js'

const parsed = (over: Partial<ParsedDocument>): ParsedDocument => ({
  title: null,
  language: null,
  pages: 2,
  sections: [],
  tables: [],
  usedOcr: false,
  ...over,
})

describe('buildPreviewPages', () => {
  it('groups text by page in order, with tables on their page', () => {
    const pages = buildPreviewPages(
      parsed({
        sections: [
          { headingPath: ['B'], text: 'Second page text.', pageFrom: 2, pageTo: 2 },
          { headingPath: ['A'], text: 'First page text.', pageFrom: 1, pageTo: 1 },
          { headingPath: ['A'], text: 'More first.', pageFrom: 1, pageTo: 1 },
        ],
        tables: [{ headingPath: [], caption: 'Days', rows: [['n', 'd']], page: 1 }],
      }),
      [],
    )
    expect(pages.map((p) => p.page)).toEqual([1, 2])
    expect(pages[0]?.text).toBe('First page text.\n\nMore first.\n\nDays\nn | d')
  })

  it('places each passage by where its text starts on its page', () => {
    const pages = buildPreviewPages(
      parsed({
        sections: [{ headingPath: [], text: 'Alpha beta. Gamma delta.', pageFrom: 1, pageTo: 1 }],
      }),
      [
        { id: 'c1', ordinal: 0, content: 'Alpha beta.', pageFrom: 1 },
        { id: 'c2', ordinal: 1, content: 'Gamma delta.', pageFrom: 1 },
        { id: 'c3', ordinal: 2, content: 'Not in the text', pageFrom: 1 },
      ],
    )
    expect(pages[0]?.passages).toEqual([
      { chunkId: 'c1', ordinal: 0, start: 0, end: 11 },
      { chunkId: 'c2', ordinal: 1, start: 12, end: 24 },
    ])
  })

  it('keeps a document without pages as one page', () => {
    const pages = buildPreviewPages(
      parsed({
        sections: [{ headingPath: [], text: 'Plain text.', pageFrom: null, pageTo: null }],
      }),
      [{ id: 'c', ordinal: 0, content: 'Plain text.', pageFrom: null }],
    )
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ page: null, text: 'Plain text.' })
    expect(pages[0]?.passages).toHaveLength(1)
  })
})
