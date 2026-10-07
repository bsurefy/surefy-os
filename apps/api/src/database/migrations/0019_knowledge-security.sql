-- Knowledge: custom SQL (runs as surefy_owner). FORCE RLS and the partial HNSW indexes of
-- knowledge_chunks, one per supported embedding dimension (docs: plan/database/knowledge.md, §5).
-- A query uses an index only when it repeats the same cast and the same predicate.
alter table knowledge_bases force row level security;
--> statement-breakpoint
alter table knowledge_base_access force row level security;
--> statement-breakpoint
alter table knowledge_sources force row level security;
--> statement-breakpoint
alter table knowledge_documents force row level security;
--> statement-breakpoint
alter table knowledge_chunks force row level security;
--> statement-breakpoint
create index knowledge_chunks_embedding_384_idx on knowledge_chunks
  using hnsw ((embedding::vector(384)) vector_cosine_ops) where embedding_dimensions = 384;
--> statement-breakpoint
create index knowledge_chunks_embedding_768_idx on knowledge_chunks
  using hnsw ((embedding::vector(768)) vector_cosine_ops) where embedding_dimensions = 768;
--> statement-breakpoint
create index knowledge_chunks_embedding_1024_idx on knowledge_chunks
  using hnsw ((embedding::vector(1024)) vector_cosine_ops) where embedding_dimensions = 1024;
--> statement-breakpoint
create index knowledge_chunks_embedding_1536_idx on knowledge_chunks
  using hnsw ((embedding::vector(1536)) vector_cosine_ops) where embedding_dimensions = 1536;
--> statement-breakpoint
-- HNSW on vector supports at most 2,000 dimensions; 3072 is indexed as halfvec (up to 4,000).
create index knowledge_chunks_embedding_3072_idx on knowledge_chunks
  using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops) where embedding_dimensions = 3072;
