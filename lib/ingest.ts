// lib/ingest.ts
// The single ingestion pipeline used by /api/upload, /api/pdfs/[id]/index, the re-index
// script and the eval:
//   parse PDF per page -> sentence/page-aware chunks -> embed (RETRIEVAL_DOCUMENT)
//   -> replace the PDF's Chunk rows and embeddings (one embedding per chunk, linked by
//      chunk_id, full chunk text as content) -> mark the PDF indexed.
// All embedding happens before any database write, so a failure never leaves a PDF
// half-indexed: either every chunk is stored with its embedding, or nothing changes.
import { randomUUID } from "crypto";
import { parsePdfPages, type ParsedPdf } from "@/lib/pdfParser";
import { chunkPages, type ChunkingConfig } from "@/lib/chunker";
import { embedTexts, EMBEDDING_DIM, EMBEDDING_MODEL, DOCUMENT_TASK_TYPE, type EmbedOptions } from "@/lib/gemini";

/** Default chunking. Chosen by MRR on the eval set; see README "Retrieval Quality". */
export const DEFAULT_CHUNKING: ChunkingConfig = { targetWords: 350, overlapWords: 50 };

export const INGEST_CONFIG = {
  parser: "pdf-parse (pdf.js), per page, running headers/footers removed",
  chunking: "sentence-packed, never crosses a page boundary, never splits a word",
  embeddingModel: EMBEDDING_MODEL,
  embeddingDim: EMBEDDING_DIM,
  documentTaskType: DOCUMENT_TASK_TYPE,
} as const;

export interface ChunkRow {
  id: string;
  pdfId: string;
  page: number;
  startChar: number;
  endChar: number;
  text: string;
}

export interface EmbeddingRow {
  pdf_id: string;
  chunk_id: string;
  content: string;
  page: number;
  embedding: number[];
}

export interface IngestStore {
  /** Atomically (as far as the backend allows) replaces all chunks + embeddings of a PDF. */
  replaceChunks(pdfId: string, chunks: ChunkRow[], embeddings: EmbeddingRow[]): Promise<void>;
  markIndexed(pdfId: string, info: { pages: number; preview: string }): Promise<void>;
}

export interface IngestOptions {
  chunking?: ChunkingConfig;
  store?: IngestStore;
  embed?: Pick<EmbedOptions, "embedBatch" | "sleep" | "maxRetries" | "baseDelayMs" | "batchSize">;
  /** Override PDF parsing (tests). */
  parse?: (buffer: ArrayBuffer | Uint8Array | Buffer) => Promise<ParsedPdf>;
}

export interface IngestResult {
  pdfId: string;
  pages: number;
  chunks: number;
  embeddings: number;
}

export async function ingestPdf(
  pdfId: string,
  buffer: ArrayBuffer | Uint8Array | Buffer,
  opts: IngestOptions = {}
): Promise<IngestResult> {
  const chunking = opts.chunking ?? DEFAULT_CHUNKING;
  const store = opts.store ?? (await import("@/lib/ingestStore")).dbIngestStore;

  const { pages } = await (opts.parse ?? parsePdfPages)(buffer);
  const textChunks = chunkPages(pages, chunking);
  if (textChunks.length === 0) throw new Error("No extractable text found in PDF (is it a scanned image?)");

  const vectors = await embedTexts(
    textChunks.map((c) => c.text),
    { ...opts.embed, taskType: DOCUMENT_TASK_TYPE, dim: EMBEDDING_DIM }
  );
  if (vectors.length !== textChunks.length)
    throw new Error(`Embedding count ${vectors.length} does not match chunk count ${textChunks.length}`);

  const chunkRows: ChunkRow[] = textChunks.map((c) => ({ id: randomUUID(), pdfId, ...c }));
  const embeddingRows: EmbeddingRow[] = chunkRows.map((c, i) => ({
    pdf_id: pdfId,
    chunk_id: c.id,
    content: c.text,
    page: c.page,
    embedding: vectors[i],
  }));

  await store.replaceChunks(pdfId, chunkRows, embeddingRows);
  await store.markIndexed(pdfId, { pages: pages.length, preview: pages.join(" ").slice(0, 2000) });

  return { pdfId, pages: pages.length, chunks: chunkRows.length, embeddings: embeddingRows.length };
}
