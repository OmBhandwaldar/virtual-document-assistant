import { test } from "node:test";
import assert from "node:assert/strict";
import { embedTexts, EmbeddingError, type EmbedBatchFn } from "@/lib/gemini";
import { ingestPdf, type IngestStore, type ChunkRow, type EmbeddingRow } from "@/lib/ingest";

const DIM = 1536;
const vec = () => Array.from({ length: DIM }, () => 0.01);
const noSleep = async () => {};

/** Fake embedder: fails `failures` times per batch before succeeding (Infinity = always fails). */
function flakyEmbedder(failures: number) {
  const calls: number[] = [];
  const attemptsByBatch = new Map<string, number>();
  const fn: EmbedBatchFn = async (texts) => {
    const key = texts[0];
    const n = (attemptsByBatch.get(key) ?? 0) + 1;
    attemptsByBatch.set(key, n);
    calls.push(texts.length);
    if (n <= failures) throw Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });
    return texts.map(vec);
  };
  return { fn, calls };
}

function memoryStore() {
  const state = { chunks: [] as ChunkRow[], embeddings: [] as EmbeddingRow[], indexed: false, replaceCalls: 0 };
  const store: IngestStore = {
    async replaceChunks(_pdfId, chunks, embeddings) {
      state.replaceCalls++;
      state.chunks = chunks;
      state.embeddings = embeddings;
    },
    async markIndexed() {
      state.indexed = true;
    },
  };
  return { store, state };
}

const sentence = (i: number) => `Sentence number ${i} talks about authentication and retrieval quality.`;
const fakePages = (n: number, sentencesPerPage: number) => ({
  pages: Array.from({ length: n }, (_, p) =>
    Array.from({ length: sentencesPerPage }, (_, s) => sentence(p * 100 + s)).join(" ")
  ),
});

// ---- embedTexts ----

test("embedTexts throws (does not skip) when a batch keeps failing after retries", async () => {
  const { fn, calls } = flakyEmbedder(Infinity);
  const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);
  await assert.rejects(
    embedTexts(texts, { embedBatch: fn, sleep: noSleep, maxRetries: 3, batchSize: 100 }),
    (err: unknown) => err instanceof EmbeddingError && /after 4 attempt/.test((err as Error).message)
  );
  assert.equal(calls.length, 4, "first batch is attempted 1 + maxRetries times, then the call aborts");
});

test("embedTexts retries a transient failure and returns one vector per text, in order", async () => {
  const { fn } = flakyEmbedder(2);
  const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);
  const out = await embedTexts(texts, { embedBatch: fn, sleep: noSleep, maxRetries: 3, batchSize: 100 });
  assert.equal(out.length, texts.length);
  assert.ok(out.every((v) => v.length === DIM));
});

test("embedTexts throws if the API returns fewer vectors than inputs", async () => {
  const short: EmbedBatchFn = async (texts) => texts.slice(1).map(vec);
  await assert.rejects(
    embedTexts(["a", "b", "c"], { embedBatch: short, sleep: noSleep, maxRetries: 1 }),
    /expected 3 vectors, got 2/
  );
});

test("embedTexts throws on wrong vector dimension", async () => {
  const wrongDim: EmbedBatchFn = async (texts) => texts.map(() => [1, 2, 3]);
  await assert.rejects(embedTexts(["a"], { embedBatch: wrongDim, sleep: noSleep, maxRetries: 0 }), /dimension 3/);
});

test("embedTexts does not retry permanent errors (400)", async () => {
  let calls = 0;
  const bad: EmbedBatchFn = async () => {
    calls++;
    throw Object.assign(new Error("400 INVALID_ARGUMENT"), { status: 400 });
  };
  await assert.rejects(embedTexts(["a"], { embedBatch: bad, sleep: noSleep, maxRetries: 5 }), EmbeddingError);
  assert.equal(calls, 1);
});

// ---- ingestPdf ----

test("ingestPdf throws and writes nothing when embedding fails after retries", async () => {
  const { fn } = flakyEmbedder(Infinity);
  const { store, state } = memoryStore();
  await assert.rejects(
    ingestPdf("pdf-1", new Uint8Array(), {
      parse: async () => fakePages(5, 40),
      store,
      embed: { embedBatch: fn, sleep: noSleep, maxRetries: 2 },
      chunking: { targetWords: 100, overlapWords: 20 },
    }),
    EmbeddingError
  );
  assert.equal(state.replaceCalls, 0, "no chunks or embeddings written");
  assert.equal(state.indexed, false);
});

test("ingestPdf stores exactly one linked embedding per chunk, with full text and real page", async () => {
  const { fn } = flakyEmbedder(1); // every batch fails once, then succeeds
  const { store, state } = memoryStore();
  const result = await ingestPdf("pdf-1", new Uint8Array(), {
    parse: async () => fakePages(5, 40),
    store,
    embed: { embedBatch: fn, sleep: noSleep, maxRetries: 2, batchSize: 7 },
    chunking: { targetWords: 100, overlapWords: 20 },
  });
  assert.ok(state.chunks.length > 5);
  assert.equal(result.chunks, state.chunks.length);
  assert.equal(state.embeddings.length, state.chunks.length, "embedding count == chunk count");
  state.embeddings.forEach((e, i) => {
    const c = state.chunks[i];
    assert.equal(e.chunk_id, c.id, "every embedding is linked to its chunk");
    assert.equal(e.content, c.text, "full chunk text, not truncated");
    assert.equal(e.page, c.page);
    assert.ok(c.page >= 1 && c.page <= 5);
  });
  assert.equal(state.indexed, true);
});
