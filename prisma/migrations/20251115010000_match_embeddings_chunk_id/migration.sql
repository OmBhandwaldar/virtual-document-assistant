-- match_embeddings now also returns chunk_id, so every retrieved passage can be traced to
-- its Chunk row (embeddings are now always linked to a chunk). The return type changes,
-- so the function has to be dropped and recreated.
DROP FUNCTION IF EXISTS public.match_embeddings(vector, integer, text[]);

CREATE FUNCTION public.match_embeddings(query_embedding vector, match_count integer, filter_pdf_ids text[])
 RETURNS TABLE(id text, chunk_id text, pdf_id text, content text, page integer, similarity double precision)
 LANGUAGE sql
AS $function$
  SELECT
    id,
    chunk_id,
    pdf_id,
    content,
    page,
    1 - (embedding <=> query_embedding) AS similarity
  FROM embeddings
  WHERE pdf_id = ANY(filter_pdf_ids)
  ORDER BY embedding <=> query_embedding  -- cosine distance (smaller = closer)
  LIMIT match_count;
$function$;
