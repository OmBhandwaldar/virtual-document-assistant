// eval/lib/ingestAdapter.ts
// How the eval ingests a PDF: through lib/ingest.ts, the same pipeline the upload and
// re-index routes use. The only difference from /api/upload is that the eval skips the
// storage upload (irrelevant to retrieval) and can override the chunking config.
//
// baseline.json / baseline-freetier-asis.json were produced by the pre-refactor pipeline
// (inline in app/api/upload/route.ts) at commit b0527af; check out that commit to reproduce them.
import { prisma } from "@/lib/prisma";
import { ingestPdf as ingest, DEFAULT_CHUNKING, INGEST_CONFIG } from "@/lib/ingest";
import { QUERY_TASK_TYPE } from "@/lib/gemini";
import type { ChunkingConfig } from "@/lib/chunker";

export function pipelineConfig(chunking: ChunkingConfig) {
  return {
    ingestPath: "lib/ingest.ts ingestPdf (shared by /api/upload, /api/pdfs/[id]/index, scripts/reindex-pdfs.ts)",
    parser: INGEST_CONFIG.parser,
    chunking: {
      method: INGEST_CONFIG.chunking,
      unit: "words",
      targetWords: chunking.targetWords,
      overlapWords: chunking.overlapWords,
      isAppDefault:
        chunking.targetWords === DEFAULT_CHUNKING.targetWords && chunking.overlapWords === DEFAULT_CHUNKING.overlapWords,
      pageAssignment: "real 1-based physical page; chunks never cross pages",
    },
    embedding: {
      model: INGEST_CONFIG.embeddingModel,
      dimension: INGEST_CONFIG.embeddingDim,
      documentTaskType: INGEST_CONFIG.documentTaskType,
      queryTaskType: QUERY_TASK_TYPE,
    },
  };
}

export async function ingestPdf(buf: Buffer, fileName: string, chatId: string, chunking: ChunkingConfig): Promise<string> {
  const pdf = await prisma.pdf.create({
    data: { title: fileName, filename: `eval_${fileName}`, storagePath: `eval/${fileName}`, pages: 0, chatId },
  });
  await ingest(pdf.id, buf, { chunking });
  return pdf.id;
}
