// SPDX-License-Identifier: AGPL-3.0-only
import { sql, type SQL } from 'drizzle-orm'

import { EMBEDDING_DIMENSIONS } from '@surefy/contracts'

import { queryTerms } from './knowledgeRerank.js'
import { HNSW_EF_SEARCH, RETRIEVAL_LIMITS, RRF_K } from './knowledgeRetrieval.constants.js'

const constant = (value: number): SQL => sql.raw(String(Math.trunc(value)))

import type { DbExecutor } from '@/core/database/index.js'

/** One passage as the fused search returns it, with its document and source names. */
export interface FoundChunk {
  chunkId: string
  documentId: string
  sourceId: string
  knowledgeBaseId: string
  content: string
  pageFrom: number | null
  pageTo: number | null
  headingPath: string[]
  tokenCount: number
  rrfScore: number
  /** Cosine similarity with the question, −1 to 1. */
  similarity: number
  documentTitle: string
  sourceName: string
}

interface FoundRow extends Record<string, unknown> {
  id: string
  document_id: string
  source_id: string
  knowledge_base_id: string
  content: string
  page_from: number | null
  page_to: number | null
  heading_path: string[] | null
  token_count: number
  rrf_score: number | string
  similarity: number | string
  document_title: string
  source_name: string
}

export interface ModelSearch {
  orgId: string
  /** The bases the asker may search that use this embedding model. */
  baseIds: readonly string[]
  modelKey: string
  dimensions: number
  embedding: readonly number[]
  question: string
}

/** Words of a question joined with OR: a passage with more of them ranks higher (`ts_rank_cd`). */
export const keywordQuery = (question: string): string =>
  queryTerms(question).slice(0, 32).join(' | ')

const uuidList = (ids: readonly string[]): SQL =>
  sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[]`

/** `vector(n)` for the sizes HNSW can index directly, `halfvec(3072)` above 2,000 dimensions. */
const castOf = (dimensions: number): { type: SQL; text: string } => {
  if (!(EMBEDDING_DIMENSIONS as readonly number[]).includes(dimensions)) {
    throw new Error(`unsupported embedding size ${dimensions}`)
  }
  const type = dimensions > 2000 ? 'halfvec' : 'vector'
  return { type: sql.raw(`${type}(${dimensions})`), text: type }
}

/**
 * The hybrid search of database/knowledge.md (Retrieval): a vector branch on the partial HNSW
 * index of the model's size and a keyword branch on the GIN index, both limited to the allowed
 * sources before ranking, fused with reciprocal rank fusion. Runs in the caller's tenant
 * transaction; the base ids it receives are never widened.
 */
export class KnowledgeRetrievalRepository {
  async search(tx: DbExecutor, input: ModelSearch): Promise<FoundChunk[]> {
    if (input.baseIds.length === 0) return []
    const org = sql`${input.orgId}::uuid`
    const cast = castOf(input.dimensions)
    const dims = sql.raw(String(input.dimensions))
    const queryVector = sql`${JSON.stringify(input.embedding)}::${cast.type}`
    const keywords = keywordQuery(input.question)
    const column = sql`c.embedding::${cast.type}`

    // transaction-local: pgvector ≥ 0.8 keeps scanning until enough rows pass the filters
    await tx.execute(sql`select set_config('hnsw.iterative_scan', 'relaxed_order', true)`)
    await tx.execute(
      sql`select set_config('hnsw.ef_search', ${constant(HNSW_EF_SEARCH)}::text, true)`,
    )

    const result = await tx.execute<FoundRow>(sql`
      with allowed as (
        select s.id as source_id
        from knowledge_sources s
        join knowledge_bases b on b.organization_id = s.organization_id and b.id = s.knowledge_base_id
        where s.organization_id = ${org}
          and b.id = any(${uuidList(input.baseIds)})
          and b.deleted_at is null
          and s.deleted_at is null
          and b.embedding_model_key = ${input.modelKey}
      ),
      vector_candidates as (
        select c.id, ${column} <=> ${queryVector} as distance
        from knowledge_chunks c
        where c.organization_id = ${org}
          and c.embedding_dimensions = ${dims}
          and c.embedding_model = ${input.modelKey}
          and c.source_id in (select source_id from allowed)
        order by ${column} <=> ${queryVector}
        limit ${constant(RETRIEVAL_LIMITS.vectorCandidates)}
      ),
      vector_hits as (
        select id, row_number() over (order by distance) as rank from vector_candidates
      ),
      keyword_candidates as (
        select c.id, ts_rank_cd(c.content_tsv, q.query) as score
        from knowledge_chunks c, to_tsquery('simple', ${keywords}) as q(query)
        where c.organization_id = ${org}
          and ${keywords} <> ''
          and c.content_tsv @@ q.query
          and c.embedding_model = ${input.modelKey}
          and c.source_id in (select source_id from allowed)
        order by score desc
        limit ${constant(RETRIEVAL_LIMITS.keywordCandidates)}
      ),
      keyword_hits as (
        select id, row_number() over (order by score desc, id) as rank from keyword_candidates
      ),
      fused as (
        select id, sum(1.0 / (${constant(RRF_K)} + rank)) as rrf_score
        from (select id, rank from vector_hits union all select id, rank from keyword_hits) h
        group by id
      )
      select c.id, c.document_id, c.source_id, c.knowledge_base_id, c.content, c.page_from,
             c.page_to, c.heading_path, c.token_count, f.rrf_score,
             1 - (${column} <=> ${queryVector}) as similarity,
             d.title as document_title, s.name as source_name
      from fused f
      join knowledge_chunks c on c.organization_id = ${org} and c.id = f.id
      join knowledge_documents d on d.organization_id = c.organization_id and d.id = c.document_id
      join knowledge_sources s on s.organization_id = c.organization_id and s.id = c.source_id
      order by f.rrf_score desc
      limit ${constant(RETRIEVAL_LIMITS.fused)}`)

    return result.rows.map((row) => ({
      chunkId: row.id,
      documentId: row.document_id,
      sourceId: row.source_id,
      knowledgeBaseId: row.knowledge_base_id,
      content: row.content,
      pageFrom: row.page_from,
      pageTo: row.page_to,
      headingPath: row.heading_path ?? [],
      tokenCount: row.token_count,
      rrfScore: Number(row.rrf_score),
      similarity: Number(row.similarity),
      documentTitle: row.document_title,
      sourceName: row.source_name,
    }))
  }

  /**
   * A cited passage as it is now, for a source preview: absent once its chunk, document, source
   * or knowledge base is gone.
   */
  async findPassage(
    tx: DbExecutor,
    orgId: string,
    chunkId: string,
  ): Promise<{ content: string; pageFrom: number | null } | undefined> {
    const result = await tx.execute<{ content: string; page_from: number | null }>(sql`
      select c.content, c.page_from
      from knowledge_chunks c
      join knowledge_sources s on s.organization_id = c.organization_id and s.id = c.source_id
      join knowledge_bases b on b.organization_id = c.organization_id and b.id = c.knowledge_base_id
      where c.organization_id = ${orgId}::uuid
        and c.id = ${chunkId}::uuid
        and s.deleted_at is null
        and b.deleted_at is null`)
    const [row] = result.rows
    return row === undefined ? undefined : { content: row.content, pageFrom: row.page_from }
  }

  /** Sources of the bases that are queued or still processing: never searched, reported back. */
  async openSourceCount(
    tx: DbExecutor,
    orgId: string,
    baseIds: readonly string[],
  ): Promise<number> {
    if (baseIds.length === 0) return 0
    const result = await tx.execute<{ count: number }>(sql`
      select count(*)::integer as count from knowledge_sources
      where organization_id = ${orgId}::uuid
        and knowledge_base_id = any(${uuidList(baseIds)})
        and deleted_at is null
        and status in ('uploading', 'queued', 'processing')`)
    return result.rows[0]?.count ?? 0
  }
}
