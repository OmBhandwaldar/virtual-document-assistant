-- Captures the pgvector table, index and RPC functions that previously existed only
-- in the Supabase project (created via the dashboard), so the repo can rebuild the
-- database from scratch. Definitions were dumped with pg_get_functiondef /
-- information_schema from the live dev database on 2026-11-15.
-- Everything here is idempotent: on a database that already has these objects it is
-- a no-op (functions are replaced with identical definitions).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "embeddings" (
  "id"         TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "pdf_id"     TEXT,
  "chunk_id"   TEXT,
  "content"    TEXT,
  "page"       INTEGER,
  "created_at" TIMESTAMPTZ(6) DEFAULT now(),
  "embedding"  vector(1536),
  CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "embeddings_chunk_id_key" UNIQUE ("chunk_id"),
  CONSTRAINT "embeddings_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "Chunk"("id") ON DELETE CASCADE,
  CONSTRAINT "embeddings_pdf_id_fkey" FOREIGN KEY ("pdf_id") REFERENCES "Pdf"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "embeddings_embedding_cos_idx"
  ON "embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.get_chunks_without_embeddings(_pdf_id text, _limit integer)
 RETURNS TABLE(id text, text text, page integer)
 LANGUAGE sql
AS $function$
  SELECT c.id, c.text, c.page
  FROM "Chunk" c
  WHERE c."pdfId" = _pdf_id
    AND NOT EXISTS (
      SELECT 1 FROM embeddings e WHERE e.chunk_id = c.id
    )
  ORDER BY c.page ASC
  LIMIT _limit;
$function$;

CREATE OR REPLACE FUNCTION public.match_embeddings(query_embedding vector, match_count integer, filter_pdf_ids text[])
 RETURNS TABLE(id text, pdf_id text, content text, page integer, similarity double precision)
 LANGUAGE sql
AS $function$
  SELECT
    id,
    pdf_id,
    content,
    page,
    1 - (embedding <=> query_embedding) AS similarity
  FROM embeddings
  WHERE pdf_id = ANY(filter_pdf_ids)
  ORDER BY embedding <=> query_embedding  -- cosine distance (smaller = closer)
  LIMIT match_count;
$function$;
