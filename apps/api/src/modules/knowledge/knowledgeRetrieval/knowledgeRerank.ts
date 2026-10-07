// SPDX-License-Identifier: AGPL-3.0-only
import { RERANK_WEIGHTS } from './knowledgeRetrieval.constants.js'

/** A passage found by the fused search, before it is reranked. */
export interface Candidate {
  chunkId: string
  content: string
  tokenCount: number
  /** Cosine similarity with the question, −1 to 1. */
  similarity: number
  rrfScore: number
}

export interface Ranked<T extends Candidate> {
  candidate: T
  /** 0–1. */
  relevance: number
}

const WORD = /[\p{L}\p{N}]+/gu

/** Lower-cased words of three letters or more: short words carry no signal for exact matching. */
export const queryTerms = (text: string): string[] => [
  ...new Set((text.toLowerCase().match(WORD) ?? []).filter((word) => word.length >= 3)),
]

/** The share of the question's words that appear in the passage. */
export function coverage(terms: readonly string[], content: string): number {
  if (terms.length === 0) return 0
  const haystack = content.toLowerCase()
  return terms.filter((term) => haystack.includes(term)).length / terms.length
}

/**
 * Orders the fused candidates by a blend of embedding similarity and exact word coverage, so a
 * passage with the question's own terms outranks a vaguely related one. Relevance is 0–1; ties
 * keep the fused order.
 */
export function rerank<T extends Candidate>(
  candidates: readonly T[],
  question: string,
): Ranked<T>[] {
  const terms = queryTerms(question)
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      relevance:
        RERANK_WEIGHTS.similarity * Math.max(0, Math.min(1, candidate.similarity)) +
        RERANK_WEIGHTS.coverage * coverage(terms, candidate.content),
    }))
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .map(({ candidate, relevance }) => ({ candidate, relevance }))
}

/**
 * The passages that reach the answer: at or above the minimum relevance, at most `limit`, and
 * within the context budget in tokens (the best passage is always kept when it alone exceeds it).
 */
export function selectPassages<T extends Candidate>(
  ranked: readonly Ranked<T>[],
  options: { minRelevance: number; limit: number; contextTokens?: number },
): Ranked<T>[] {
  const selected: Ranked<T>[] = []
  let tokens = 0
  for (const item of ranked) {
    if (selected.length >= options.limit || item.relevance < options.minRelevance) break
    const next = tokens + item.candidate.tokenCount
    if (
      options.contextTokens !== undefined &&
      selected.length > 0 &&
      next > options.contextTokens
    ) {
      break
    }
    selected.push(item)
    tokens = next
  }
  return selected
}
