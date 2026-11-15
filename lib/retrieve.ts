// lib/retrieve.ts
// Retrieval used by /api/chat/query and the eval: embed the question as a retrieval
// query, then nearest-neighbour search over the given PDFs' chunk embeddings.
import { supabaseServer } from "@/lib/supabaseClient";
import { embedQueryGemini, EMBEDDING_DIM } from "@/lib/gemini";

export interface RetrievedChunk {
  id: string;
  chunk_id: string | null;
  pdf_id: string;
  content: string;
  page: number;
  similarity: number;
}

export async function retrieveChunks(question: string, pdfIds: string[], topK = 5): Promise<RetrievedChunk[]> {
  const qvec = await embedQueryGemini(question, EMBEDDING_DIM);
  const { data, error } = await supabaseServer().rpc("match_embeddings", {
    query_embedding: qvec,
    match_count: topK,
    filter_pdf_ids: pdfIds,
  });
  if (error) throw new Error(`match_embeddings failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}
