// scripts/reindex-pdfs.ts
// Re-indexes PDFs already in the database with the current ingestion pipeline (real page
// numbers, sentence chunks, chunk-linked embeddings). Required once after upgrading from
// the old pipeline, whose chunks had fake page numbers and unlinked embeddings.
//
//   npm run reindex -- --dry-run          # list what would be re-indexed
//   npm run reindex                       # re-index every PDF (except the eval chat's)
//   npm run reindex -- --pdf <id> [...]   # only these PDFs
//
// Each PDF is downloaded from Supabase storage and run through lib/ingest.ts, which
// replaces its chunks and embeddings. A PDF that fails is reported and left unchanged
// (ingestion writes nothing unless embedding succeeded); the script continues and exits
// non-zero if anything failed.
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabaseClient";
import { ingestPdf } from "@/lib/ingest";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.flatMap((a, i) => (args[i - 1] === "--pdf" ? [a] : []));
const EVAL_CHAT_TITLE = "__rag_eval__";

async function main() {
  const evalChat = await prisma.chat.findFirst({ where: { title: EVAL_CHAT_TITLE }, select: { id: true } });
  const pdfs = await prisma.pdf.findMany({
    where: {
      ...(only.length ? { id: { in: only } } : {}),
      ...(evalChat ? { OR: [{ chatId: null }, { chatId: { not: evalChat.id } }] } : {}),
    },
    select: { id: true, title: true, storagePath: true, pages: true, _count: { select: { chunks: true } } },
    orderBy: { uploadedAt: "asc" },
  });

  console.log(`${pdfs.length} PDF(s) to re-index${dryRun ? " (dry run)" : ""}`);
  const supabase = supabaseServer();
  let ok = 0;
  const failed: string[] = [];

  for (const [i, pdf] of pdfs.entries()) {
    const tag = `[${i + 1}/${pdfs.length}] ${pdf.title} (${pdf.id})`;
    if (dryRun) {
      console.log(`${tag}: ${pdf._count.chunks} chunks now`);
      continue;
    }
    try {
      const { data, error } = await supabase.storage.from("pdfs").download(pdf.storagePath.replace(/^pdfs\//, ""));
      if (error || !data) throw new Error(`download failed: ${error?.message ?? "no data"}`);
      const r = await ingestPdf(pdf.id, new Uint8Array(await data.arrayBuffer()));
      console.log(`${tag}: ${pdf._count.chunks} -> ${r.chunks} chunks, ${r.pages} pages`);
      ok++;
    } catch (err) {
      console.error(`${tag}: FAILED ${(err as Error).message}`);
      failed.push(pdf.id);
    }
  }

  if (!dryRun) console.log(`\nDone: ${ok} re-indexed, ${failed.length} failed${failed.length ? `: ${failed.join(" ")}` : ""}`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
