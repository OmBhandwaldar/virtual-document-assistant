// app/api/pdfs/[id]/index/route.ts
// (Re-)indexes an already uploaded PDF: downloads it from storage and runs the shared
// ingestion pipeline, replacing any existing chunks and embeddings.
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import { prisma } from "@/lib/prisma";
import { ingestPdf } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const pdfRecord = await prisma.pdf.findUnique({ where: { id } });
    if (!pdfRecord) return NextResponse.json({ error: "PDF not found" }, { status: 404 });

    const { data: file, error: downloadError } = await supabaseServer()
      .storage.from("pdfs")
      .download(pdfRecord.storagePath.replace(/^pdfs\//, ""));
    if (downloadError || !file) {
      return NextResponse.json(
        { error: `File download failed: ${downloadError?.message ?? "no data"}` },
        { status: 500 }
      );
    }

    const result = await ingestPdf(id, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({
      success: true,
      message: `Indexed ${result.chunks} chunks from ${result.pages} pages.`,
      ...result,
    });
  } catch (err: unknown) {
    console.error("Indexing error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
