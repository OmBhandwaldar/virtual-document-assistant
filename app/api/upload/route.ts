import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";
import { prisma } from "@/lib/prisma";
import { ingestPdf } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File;
    const chatId = form.get("chatId") as string | null;

    if (!file)
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (file.type !== "application/pdf")
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });

    if (chatId) {
      const chatExists = await prisma.chat.findUnique({ where: { id: chatId } });
      if (!chatExists) {
        return NextResponse.json({ error: "Invalid chatId" }, { status: 400 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = supabaseServer();
    const fileName = `${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("pdfs")
      .upload(fileName, buffer, { contentType: "application/pdf" });
    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const pdfRecord = await prisma.pdf.create({
      data: {
        title: file.name,
        filename: fileName,
        storagePath: `pdfs/${fileName}`,
        pages: 0,
        chatId: chatId ?? null,
      },
    });

    // Parse per page, chunk, embed and store. Throws (and stores nothing) on failure, so the
    // client gets a real error instead of a PDF that silently can't be searched.
    try {
      const result = await ingestPdf(pdfRecord.id, buffer);
      console.log(`Indexed ${file.name}: ${result.pages} pages, ${result.chunks} chunks`);
      return NextResponse.json({
        success: true,
        message: "Uploaded, chunked, and embedded successfully!",
        pdfId: pdfRecord.id,
        chatId,
        pages: result.pages,
        chunks: result.chunks,
      });
    } catch (err) {
      console.error("Indexing failed:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: `Uploaded but indexing failed: ${message}. Retry via /api/pdfs/${pdfRecord.id}/index.`, pdfId: pdfRecord.id },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
