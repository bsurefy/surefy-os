// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { coverage, queryTerms, rerank, selectPassages, type Candidate } from '../knowledgeRerank.js'

const candidate = (id: string, content: string, similarity: number, tokens = 100): Candidate => ({
  chunkId: id,
  content,
  tokenCount: tokens,
  similarity,
  rrfScore: 0.01,
})

describe('queryTerms and coverage', () => {
  it('keeps distinct words of three letters or more, in any language', () => {
    expect(queryTerms('How do I get an expense refund? Refund policy')).toEqual([
      'how',
      'get',
      'expense',
      'refund',
      'policy',
    ])
    expect(queryTerms('Größe über 42')).toEqual(['größe', 'über'])
  })

  it('measures the share of terms found', () => {
    expect(coverage(['refund', 'policy'], 'The Refund rules')).toBe(0.5)
    expect(coverage([], 'anything')).toBe(0)
  })
})

describe('rerank', () => {
  it('lets exact words lift a slightly less similar passage', () => {
    const ranked = rerank(
      [
        candidate('a', 'unrelated paragraph about holidays', 0.62),
        candidate('b', 'the refund policy for expenses', 0.55),
      ],
      'refund policy',
    )
    expect(ranked.map((r) => r.candidate.chunkId)).toEqual(['b', 'a'])
  })

  it('keeps relevance within 0 and 1 and the fused order on ties', () => {
    const ranked = rerank(
      [candidate('a', 'x', 1.4), candidate('b', 'y', -0.3), candidate('c', 'z', 0)],
      'nothing matches',
    )
    for (const r of ranked) {
      expect(r.relevance).toBeGreaterThanOrEqual(0)
      expect(r.relevance).toBeLessThanOrEqual(1)
    }
    expect(ranked.map((r) => r.candidate.chunkId)).toEqual(['a', 'b', 'c'])
  })
})

describe('selectPassages', () => {
  const ranked = rerank(
    [
      candidate('a', 'alpha', 0.9),
      candidate('b', 'beta', 0.8),
      candidate('c', 'gamma', 0.7),
      candidate('d', 'delta', 0.1),
    ],
    'alpha',
  )

  it('stops at the passage limit and the minimum relevance', () => {
    expect(
      selectPassages(ranked, { minRelevance: 0, limit: 2 }).map((r) => r.candidate.chunkId),
    ).toEqual(['a', 'b'])
    expect(
      selectPassages(ranked, { minRelevance: 0.5, limit: 10 }).map((r) => r.candidate.chunkId),
    ).toEqual(['a', 'b', 'c'])
  })

  it('fits the context budget but always keeps the best passage', () => {
    const big = rerank(
      [candidate('a', 'alpha', 0.9, 900), candidate('b', 'beta', 0.8, 100)],
      'alpha',
    )
    expect(
      selectPassages(big, { minRelevance: 0, limit: 5, contextTokens: 500 }).map(
        (r) => r.candidate.chunkId,
      ),
    ).toEqual(['a'])
    expect(
      selectPassages(ranked, { minRelevance: 0, limit: 5, contextTokens: 250 }).map(
        (r) => r.candidate.chunkId,
      ),
    ).toEqual(['a', 'b'])
  })
})
