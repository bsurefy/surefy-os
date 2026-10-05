// SPDX-License-Identifier: AGPL-3.0-only

/** Candidates each branch keeps before fusion, and passages kept after it (database/knowledge.md, Retrieval). */
export const RETRIEVAL_LIMITS = {
  vectorCandidates: 50,
  keywordCandidates: 50,
  fused: 30,
} as const

/** Reciprocal rank fusion constant. */
export const RRF_K = 60

/** `hnsw.ef_search` for the transaction: deeper than the default so filters still leave enough rows. */
export const HNSW_EF_SEARCH = 100

/** How the reranked relevance mixes the embedding similarity and the question words found. */
export const RERANK_WEIGHTS = { similarity: 0.75, coverage: 0.25 } as const

/** Passages kept for an answer when the caller does not say. */
export const DEFAULT_PASSAGES = 5
