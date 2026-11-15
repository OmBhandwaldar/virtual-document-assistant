// eval/lib/ingestAdapter.ts
// How the eval ingests a PDF. It must go through the app's real ingestion code so
// the numbers describe what production actually does.
//
// "upload-route": calls the POST handler of app/api/upload/route.ts directly with a
// real multipart Request — the exact code path the UI uses.
import { POST as uploadPOST } from "@/app/api/upload/route";

export interface PipelineConfig {
  ingestPath: string;
  parser: string;
  chunking: Record<string, unknown>;
  embedding: { model: string; dimension: number; documentTaskType: string | null; queryTaskType: string | null };
}

export const PIPELINE: PipelineConfig = {
  ingestPath: "app/api/upload/route.ts POST (inline pipeline)",
  parser: "pdf2json (lib/pdfParser.ts), whitespace collapsed to single spaces, page boundaries discarded",
  chunking: {
    method: "fixed-size character windows (lib/chunker.ts chunkText)",
    unit: "characters",
    size: 400,
    overlap: 80,
    pageAssignment: "page = chunk index + 1 (not a real page number)",
  },
  embedding: {
    model: "gemini-embedding-001",
    dimension: 1536,
    documentTaskType: null,
    queryTaskType: null,
  },
};

export async function ingestPdf(buf: Buffer, fileName: string, chatId: string): Promise<string> {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(buf)], fileName, { type: "application/pdf" }));
  form.append("chatId", chatId);
  const res = await uploadPOST(new Request("http://localhost/api/upload", { method: "POST", body: form }));
  const body = (await res.json()) as { pdfId?: string; error?: string };
  if (!res.ok || !body.pdfId) throw new Error(`upload route failed (${res.status}): ${body.error}`);
  return body.pdfId;
}
