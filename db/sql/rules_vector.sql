-- Rules knowledge base: pgvector extension, indexes, and the match_rule_chunks()
-- semantic-search function. Verbatim from RULES_VECTOR_DB.md (lines ~157-294).
--
-- Drizzle cannot express the HNSW vector index or this function, so they live here
-- as raw SQL applied once after the base schema (drizzle/0000_init.sql).
-- Run via: `npm run db:migrate` (which applies drizzle migrations then this file),
-- or directly: `psql "$DATABASE_URL" -f db/sql/rules_vector.sql`
--
-- NOTE: `CREATE EXTENSION vector` requires the pgvector package installed on the
-- Postgres server and may require superuser privileges the first time. The
-- recommended Docker image `pgvector/pgvector:pg16` ships the extension.

CREATE EXTENSION IF NOT EXISTS vector;

-- Indexes for rule_chunks (per RULES_VECTOR_DB.md)
CREATE INDEX IF NOT EXISTS rule_chunks_page_id_idx ON public.rule_chunks (page_id);
CREATE INDEX IF NOT EXISTS rule_chunks_active_idx ON public.rule_chunks (is_active);
CREATE INDEX IF NOT EXISTS rule_chunks_embedding_idx
    ON public.rule_chunks
    USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

-- Semantic search over rule chunks (cosine similarity via pgvector <=> operator)
CREATE OR REPLACE FUNCTION public.match_rule_chunks (
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    filter_category text DEFAULT null,
    include_unresolved boolean DEFAULT false
)
RETURNS TABLE (
    chunk_id text,
    page_id uuid,
    doc_id text,
    title text,
    category text,
    resolved_category text,
    source_url text,
    chunk_text text,
    metadata jsonb,
    similarity float
)
LANGUAGE sql
AS $$
    SELECT
        rc.chunk_id,
        rp.id AS page_id,
        rp.doc_id,
        rp.title,
        rp.category,
        rp.resolved_category,
        rp.source_url,
        rc.chunk_text,
        rc.metadata,
        1 - (rc.embedding <=> query_embedding) AS similarity
    FROM public.rule_chunks rc
    JOIN public.rule_pages rp ON rp.id = rc.page_id
    WHERE rc.is_active = true
      AND rp.deleted_at IS NULL
      AND rc.embedding IS NOT NULL
      AND (filter_category IS NULL OR rp.category = filter_category)
      AND (include_unresolved = true OR rp.is_unresolved = false)
      AND 1 - (rc.embedding <=> query_embedding) >= match_threshold
    ORDER BY rc.embedding <=> query_embedding
    LIMIT match_count;
$$;
