// lib/ingestStore.ts
// Database-backed IngestStore: Chunk rows via Prisma, embeddings via Supabase (pgvector).
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabaseClient";
import type { IngestStore } from "@/lib/ingest";

const INSERT_BATCH = 100;

export const dbIngestStore: IngestStore = {
  async replaceChunks(pdfId, chunks, embeddings) {
    const supabase = supabaseServer();
    // Old embeddings first (they reference chunks), then old chunks.
    await prisma.embeddings.deleteMany({ where: { pdf_id: pdfId } });
    await prisma.chunk.deleteMany({ where: { pdfId } });
    try {
      for (let i = 0; i < chunks.length; i += 1000) {
        await prisma.chunk.createMany({ data: chunks.slice(i, i + 1000) });
      }
      for (let i = 0; i < embeddings.length; i += INSERT_BATCH) {
        const { error } = await supabase.from("embeddings").insert(embeddings.slice(i, i + INSERT_BATCH));
        if (error) throw new Error(`Embedding insert failed: ${error.message}`);
      }
      const stored = await prisma.embeddings.count({ where: { pdf_id: pdfId, chunk_id: { not: null } } });
      if (stored !== chunks.length)
        throw new Error(`Stored ${stored} linked embeddings for ${chunks.length} chunks`);
    } catch (err) {
      // Don't leave a half-indexed PDF behind: chunks without embeddings are invisible to search.
      await prisma.embeddings.deleteMany({ where: { pdf_id: pdfId } });
      await prisma.chunk.deleteMany({ where: { pdfId } });
      await prisma.pdf.update({ where: { id: pdfId }, data: { indexedAt: null } });
      throw err;
    }
  },

  async markIndexed(pdfId, { pages, preview }) {
    await prisma.pdf.update({ where: { id: pdfId }, data: { pages, preview, indexedAt: new Date() } });
  },
};
