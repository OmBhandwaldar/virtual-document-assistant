// eval/run-eval.ts
// Retrieval-quality and citation-accuracy eval for the RAG pipeline.
//
//   npm run eval -- --out eval/results/after.json [--label after] [--skip-ingest]
//                   [--target-words 350 --overlap-words 50]   (default: the app default chunking)
//
// 1. Ingests every PDF in eval/pdfs through the app's real ingestion code
//    (eval/lib/ingestAdapter.ts) under a dedicated chat titled "__rag_eval__".
//    Only rows/files belonging to that chat are ever deleted; other data is untouched.
// 2. For each question in eval/questions.json runs lib/retrieve.ts retrieveChunks — the
//    same function app/api/chat/query/route.ts uses — with topK=5, filtered to that
//    question's PDF.
// 3. Scores the results and writes a JSON report.
//
// Metrics (relevant pages R = {answerPage} ∪ acceptablePages[].page):
//   Recall@1, Recall@5, MRR@5 — a retrieved chunk is a hit if the page STORED for it
//     (what the app would cite) is in R. This is what a user experiences.
//   *_truePage variants — same, but a chunk is a hit if the pages its text ACTUALLY
//     spans intersect R (located in the per-page PDF text). This isolates retrieval
//     quality from page-labelling bugs.
//   citationAccuracy — over every returned citation {pdfId, page}: share whose cited
//     page actually contains (part of) the cited chunk text.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { supabaseServer } from "@/lib/supabaseClient";
import { retrieveChunks } from "@/lib/retrieve";
import { DEFAULT_CHUNKING } from "@/lib/ingest";
import { pipelineConfig, ingestPdf } from "./lib/ingestAdapter";
import { buildPageIndexes, locateChunk, type PageIndex } from "./lib/pageText";

const TOP_K = 5;
const EVAL_CHAT_TITLE = "__rag_eval__";
const PDF_DIR = path.resolve("eval/pdfs");

interface Question {
  id: string;
  pdfFile: string;
  type: string;
  question: string;
  answerPage: number;
  answerSnippet: string;
  acceptablePages?: { page: number; snippet: string }[];
}
interface Match {
  id: string;
  pdf_id: string;
  content: string;
  page: number;
  similarity: number;
}

interface QuestionResult {
  id: string;
  pdfFile: string;
  type: string;
  relevantPages: number[];
  returned: number;
  firstHitRankStored: number | null;
  firstHitRankTrue: number | null;
  results: {
    rank: number;
    storedPage: number;
    truePages: number[] | null;
    similarity: number;
    hitStored: boolean;
    hitTrue: boolean;
    citationCorrect: boolean | null;
    preview: string;
  }[];
}

const args = process.argv.slice(2);
const arg = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);
const OUT = arg("out", `eval/results/run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)!;
const LABEL = arg("label", path.basename(OUT, ".json"))!;
const CHUNKING = {
  targetWords: Number(arg("target-words", String(DEFAULT_CHUNKING.targetWords))),
  overlapWords: Number(arg("overlap-words", String(DEFAULT_CHUNKING.overlapWords))),
};

// Silence the app's chatty console.log (and Prisma query logs) while still printing our own progress.
const log = console.log.bind(console);
console.log = () => {};
console.info = () => {};

async function getEvalChat() {
  const existing = await prisma.chat.findFirst({ where: { title: EVAL_CHAT_TITLE } });
  return existing ?? prisma.chat.create({ data: { title: EVAL_CHAT_TITLE } });
}

async function cleanEvalData(chatId: string) {
  const pdfs = await prisma.pdf.findMany({ where: { chatId }, select: { id: true, filename: true } });
  if (!pdfs.length) return;
  const ids = pdfs.map((p) => p.id);
  const supabase = supabaseServer();
  await supabase.storage.from("pdfs").remove(pdfs.map((p) => p.filename));
  await prisma.embeddings.deleteMany({ where: { pdf_id: { in: ids } } });
  await prisma.chunk.deleteMany({ where: { pdfId: { in: ids } } });
  await prisma.quiz.deleteMany({ where: { pdfId: { in: ids } } });
  await prisma.pdf.deleteMany({ where: { id: { in: ids } } });
  log(`cleaned ${ids.length} previous eval PDFs`);
}

async function main() {
  const questions: Question[] = JSON.parse(fs.readFileSync("eval/questions.json", "utf8"));
  const pdfFiles = [...new Set(questions.map((q) => q.pdfFile))];
  const chat = await getEvalChat();

  // ---- ingest ----
  const pdfIdByFile = new Map<string, string>();
  if (flag("skip-ingest")) {
    for (const f of pdfFiles) {
      const rec = await prisma.pdf.findFirst({ where: { chatId: chat.id, title: f }, orderBy: { uploadedAt: "desc" } });
      if (!rec) throw new Error(`--skip-ingest but ${f} is not ingested`);
      pdfIdByFile.set(f, rec.id);
    }
  } else {
    await cleanEvalData(chat.id);
    for (const f of pdfFiles) {
      const t0 = Date.now();
      const id = await ingestPdf(fs.readFileSync(path.join(PDF_DIR, f)), f, chat.id, CHUNKING);
      pdfIdByFile.set(f, id);
      log(`ingested ${f} -> ${id} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  }

  // ---- corpus stats + page indexes ----
  const corpus: Record<string, unknown> = {};
  const pageIdx = new Map<string, PageIndex[]>();
  let embeddingDim: number | null = null;
  for (const f of pdfFiles) {
    const id = pdfIdByFile.get(f)!;
    const buf = fs.readFileSync(path.join(PDF_DIR, f));
    const idx = await buildPageIndexes(buf);
    pageIdx.set(f, idx);
    const chunks = await prisma.chunk.count({ where: { pdfId: id } });
    const emb = await prisma.embeddings.count({ where: { pdf_id: id } });
    const embLinked = await prisma.embeddings.count({ where: { pdf_id: id, chunk_id: { not: null } } });
    const dimRows = await prisma.$queryRawUnsafe<{ dim: number }[]>(
      `select vector_dims(embedding) as dim from embeddings where pdf_id = $1 limit 1`,
      id
    );
    embeddingDim = dimRows[0]?.dim ?? embeddingDim;
    corpus[f] = { pdfId: id, pages: idx[0].pages.length, chunks, embeddings: emb, embeddingsLinkedToChunk: embLinked };
  }

  // ---- retrieval + scoring ----
  const perQuestion: QuestionResult[] = [];
  for (const q of questions) {
    const pdfId = pdfIdByFile.get(q.pdfFile)!;
    const relevant = new Set([q.answerPage, ...(q.acceptablePages ?? []).map((a) => a.page)]);
    const matches = (await retrieveChunks(q.question, [pdfId], TOP_K)) as Match[];
    const results = matches.map((m, rank) => {
      const loc = locateChunk(m.content ?? "", pageIdx.get(q.pdfFile)!);
      return {
        rank: rank + 1,
        storedPage: m.page,
        truePages: loc?.pages ?? null,
        similarity: Number(m.similarity.toFixed(4)),
        hitStored: relevant.has(m.page),
        hitTrue: loc ? loc.pages.some((p) => relevant.has(p)) : false,
        citationCorrect: loc ? loc.pages.includes(m.page) : null,
        preview: (m.content ?? "").slice(0, 120),
      };
    });
    const firstStored = results.find((r) => r.hitStored)?.rank ?? null;
    const firstTrue = results.find((r) => r.hitTrue)?.rank ?? null;
    perQuestion.push({
      id: q.id,
      pdfFile: q.pdfFile,
      type: q.type,
      relevantPages: [...relevant],
      returned: results.length,
      firstHitRankStored: firstStored,
      firstHitRankTrue: firstTrue,
      results,
    });
    log(`${q.id.padEnd(7)} stored@${firstStored ?? "-"} true@${firstTrue ?? "-"} returned=${results.length}`);
  }

  const summarize = (rows: typeof perQuestion) => {
    const n = rows.length;
    const r = (k: number, key: "firstHitRankStored" | "firstHitRankTrue") =>
      round(rows.filter((x) => x[key] !== null && x[key]! <= k).length / n);
    const mrr = (key: "firstHitRankStored" | "firstHitRankTrue") =>
      round(rows.reduce((s, x) => s + (x[key] ? 1 / x[key]! : 0), 0) / n);
    const cites = rows.flatMap((x) => x.results);
    const located = cites.filter((c) => c.citationCorrect !== null);
    return {
      questions: n,
      recallAt1: r(1, "firstHitRankStored"),
      recallAt5: r(5, "firstHitRankStored"),
      mrrAt5: mrr("firstHitRankStored"),
      recallAt1_truePage: r(1, "firstHitRankTrue"),
      recallAt5_truePage: r(5, "firstHitRankTrue"),
      mrrAt5_truePage: mrr("firstHitRankTrue"),
      citations: cites.length,
      citationsLocated: located.length,
      citationAccuracy: located.length ? round(located.filter((c) => c.citationCorrect).length / located.length) : null,
      avgResultsReturned: round(cites.length / n),
      queriesWithFewerThanTopK: rows.filter((x) => x.returned < TOP_K).length,
    };
  };
  const group = (key: "pdfFile" | "type") =>
    Object.fromEntries([...new Set(perQuestion.map((x) => x[key]))].map((k) => [k, summarize(perQuestion.filter((x) => x[key] === k))]));

  let gitCommit = "unknown";
  let gitDirty = false;
  try {
    gitCommit = execSync("git rev-parse --short HEAD").toString().trim();
    gitDirty = execSync("git status --porcelain -- lib app eval/run-eval.ts eval/lib").toString().trim().length > 0;
  } catch {}

  const report = {
    label: LABEL,
    createdAt: new Date().toISOString(),
    gitCommit,
    gitDirty,
    pipeline: (() => {
      const p = pipelineConfig(CHUNKING);
      return { ...p, embedding: { ...p.embedding, dimensionObservedInDb: embeddingDim } };
    })(),
    retrieval: { rpc: "match_embeddings", topK: TOP_K, filter: "question's own PDF", index: "ivfflat (lists=100), default probes" },
    questionsFile: "eval/questions.json",
    corpus,
    metrics: { overall: summarize(perQuestion), byPdf: group("pdfFile"), byType: group("type") },
    perQuestion,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  log(`\nwrote ${OUT}`);
  log(JSON.stringify({ corpus, overall: report.metrics.overall }, null, 2));
}

const round = (x: number) => Math.round(x * 1000) / 1000;

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
