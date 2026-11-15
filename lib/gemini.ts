import { GoogleGenAI } from "@google/genai";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 1536;
export const DOCUMENT_TASK_TYPE = "RETRIEVAL_DOCUMENT";
export const QUERY_TASK_TYPE = "RETRIEVAL_QUERY";

export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

/** Embeds one batch of texts; must return exactly one vector per input, in order. */
export type EmbedBatchFn = (texts: string[], opts: { dim: number; taskType: string }) => Promise<number[][]>;

export const geminiEmbedBatch: EmbedBatchFn = async (texts, { dim, taskType }) => {
  const res = await gemini.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { outputDimensionality: dim, taskType },
  });
  return (res.embeddings ?? []).map((e) => e.values as number[]);
};

export interface EmbedOptions {
  dim?: number;
  taskType?: string;
  batchSize?: number;
  /** Retries per batch after the first attempt. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  embedBatch?: EmbedBatchFn;
  sleep?: (ms: number) => Promise<void>;
}

export class EmbeddingError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "EmbeddingError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Errors that will not succeed on retry (bad request / auth / not found). */
function isPermanent(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 400 || status === 401 || status === 403 || status === 404;
}

/** Server-suggested retry delay, e.g. "Please retry in 41.9s" from a 429. */
function suggestedDelayMs(err: unknown): number | null {
  const m = String((err as Error)?.message ?? "").match(/retry in ([\d.]+)s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

/**
 * Embeds `texts` in batches. A failed batch is retried with exponential backoff (honouring
 * the server's suggested delay on 429s); if it still fails, this throws rather than
 * returning fewer vectors. The result always has exactly one `dim`-length vector per
 * input text, in the same order, or the call throws.
 */
export async function embedTexts(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
  const {
    dim = EMBEDDING_DIM,
    taskType = DOCUMENT_TASK_TYPE,
    batchSize = 100,
    maxRetries = 5,
    baseDelayMs = 1000,
    maxDelayMs = 60_000,
    embedBatch = geminiEmbedBatch,
    sleep = defaultSleep,
  } = opts;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const label = `batch ${i / batchSize + 1} (items ${i}-${i + batch.length - 1})`;
    let attempt = 0;
    for (;;) {
      try {
        const vectors = await embedBatch(batch, { dim, taskType });
        if (vectors.length !== batch.length)
          throw new EmbeddingError(`${label}: expected ${batch.length} vectors, got ${vectors.length}`);
        const bad = vectors.findIndex((v) => !Array.isArray(v) || v.length !== dim);
        if (bad >= 0) throw new EmbeddingError(`${label}: vector ${bad} has dimension ${vectors[bad]?.length}, expected ${dim}`);
        out.push(...vectors);
        break;
      } catch (err) {
        if (isPermanent(err) || attempt >= maxRetries) {
          throw new EmbeddingError(
            `Embedding ${label} failed after ${attempt + 1} attempt(s): ${(err as Error)?.message ?? err}`,
            err
          );
        }
        const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.75 + Math.random() * 0.5);
        const delay = Math.max(backoff, suggestedDelayMs(err) ?? 0);
        console.warn(`Embedding ${label} attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms`);
        await sleep(delay);
        attempt++;
      }
    }
  }

  if (out.length !== texts.length) throw new EmbeddingError(`expected ${texts.length} vectors, got ${out.length}`);
  return out;
}

/** Embeds document chunks (taskType RETRIEVAL_DOCUMENT). Kept for existing callers. */
export async function embedTextsGemini(texts: string[], { dim = EMBEDDING_DIM } = {}): Promise<number[][]> {
  return embedTexts(texts, { dim, taskType: DOCUMENT_TASK_TYPE });
}

/** Embeds a user query for retrieval (taskType RETRIEVAL_QUERY). */
export async function embedQueryGemini(text: string, dim = EMBEDDING_DIM): Promise<number[]> {
  const [vec] = await embedTexts([text], { dim, taskType: QUERY_TASK_TYPE, maxRetries: 3 });
  return vec;
}
