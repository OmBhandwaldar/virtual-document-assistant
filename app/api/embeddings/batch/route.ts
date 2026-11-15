import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import { embedTexts, DOCUMENT_TASK_TYPE, EMBEDDING_DIM } from "@/lib/gemini";

interface ChunkData {
  id: string;
  text: string;
  page: number;
}

export const runtime = "nodejs";

/**
 * Backfills embeddings for chunks that don't have one yet (normally not needed: ingestion
 * embeds every chunk). Body: { pdfId: string, batchSize?: number }.
 * Call repeatedly until the response says "No chunks left to embed".
 */
export async function POST(req: Request) {
  const { pdfId, batchSize = 10 } = await req.json();
  if (!pdfId) {
    return NextResponse.json({ error: "Missing pdfId" }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data: chunks, error: fetchErr } = await supabase.rpc("get_chunks_without_embeddings", {
    _pdf_id: pdfId,
    _limit: batchSize,
  });
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!chunks || chunks.length === 0) {
    return NextResponse.json({ message: "No chunks left to embed", pdfId });
  }

  try {
    // Throws after retries instead of returning fewer vectors than chunks.
    const vectors = await embedTexts(
      chunks.map((c: ChunkData) => c.text),
      { dim: EMBEDDING_DIM, taskType: DOCUMENT_TASK_TYPE }
    );
    const rows = chunks.map((c: ChunkData, i: number) => ({
      pdf_id: pdfId,
      chunk_id: c.id,
      content: c.text,
      embedding: vectors[i],
      page: c.page,
    }));
    const { error: insertErr } = await supabase.from("embeddings").upsert(rows, { onConflict: "chunk_id" });
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json({ success: true, inserted: rows.length, pdfId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
