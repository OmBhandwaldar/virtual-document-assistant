// lib/chunker.ts
// Sentence-aware, page-aware chunking.
//
// Each page's text is split into sentences, and sentences are packed into chunks of up to
// `targetWords` words. Consecutive chunks share up to `overlapWords` words of whole
// trailing sentences. Chunks never cross a page boundary, so every chunk has exactly one
// real page number to cite. Text is never cut mid-word: a single sentence longer than
// `targetWords` (tables, code, lists without punctuation) is split on word boundaries.

export interface ChunkingConfig {
  /** Maximum words per chunk. */
  targetWords: number;
  /** Words of whole trailing sentences repeated at the start of the next chunk (same page). */
  overlapWords: number;
}

export interface TextChunk {
  /** 1-based physical page number. */
  page: number;
  /** Character offsets of the chunk within that page's text. */
  startChar: number;
  endChar: number;
  text: string;
}

// Abbreviations that end in a period but don't end a sentence.
const ABBREVIATIONS = new Set(
  "e.g i.e etc vs cf al fig figs eq eqs sec secs no nos vol pp p ch ed eds approx dr mr mrs ms prof st jr sr inc ltd co corp dept univ u.s u.k".split(" ")
);

interface Span {
  start: number;
  end: number;
  words: number;
}

const countWords = (s: string) => (s.match(/\S+/g) ?? []).length;

/** Splits text into sentence spans (character offsets into `text`). */
export function splitSentences(text: string): Span[] {
  const spans: Span[] = [];
  // candidate boundary: terminal punctuation (optionally followed by closing quotes/brackets) then whitespace
  const re = /[.!?]["'”’)\]]*\s+/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const before = text.slice(start, m.index + 1);
    const lastToken = before.match(/(\S+)$/)?.[1] ?? "";
    const bare = lastToken.replace(/^[("'“‘[]+/, "").replace(/[.!?"'”’)\]]+$/, "").toLowerCase();
    const next = text.slice(end, end + 1);
    const isAbbrev = ABBREVIATIONS.has(bare) || /^[a-z]$/i.test(bare); // "e.g." / initials "A."
    const isDecimalOrSection = /\d$/.test(bare) && /^\d/.test(next); // "2.9. Effect", "5.1.1"
    const nextStartsLower = /^[a-z]/.test(next);
    if (isAbbrev || isDecimalOrSection || nextStartsLower) continue;
    pushSpan(text, spans, start, end);
    start = end;
  }
  pushSpan(text, spans, start, text.length);
  return spans;
}

function pushSpan(text: string, spans: Span[], start: number, end: number) {
  // trim surrounding whitespace so offsets point at real text
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end > start) spans.push({ start, end, words: countWords(text.slice(start, end)) });
}

/** Splits a span longer than `maxWords` into word-boundary pieces of at most `maxWords` words. */
function splitLongSpan(text: string, span: Span, maxWords: number): Span[] {
  if (span.words <= maxWords) return [span];
  const out: Span[] = [];
  const wordRe = /\S+/g;
  wordRe.lastIndex = span.start;
  let pieceStart = -1;
  let pieceEnd = span.start;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) && m.index < span.end) {
    if (pieceStart < 0) pieceStart = m.index;
    pieceEnd = m.index + m[0].length;
    if (++n === maxWords) {
      out.push({ start: pieceStart, end: pieceEnd, words: n });
      pieceStart = -1;
      n = 0;
    }
  }
  if (n > 0 && pieceStart >= 0) out.push({ start: pieceStart, end: pieceEnd, words: n });
  return out;
}

export function chunkPage(text: string, page: number, cfg: ChunkingConfig): TextChunk[] {
  validate(cfg);
  const units = splitSentences(text).flatMap((s) => splitLongSpan(text, s, cfg.targetWords));
  const chunks: TextChunk[] = [];
  let i = 0;
  while (i < units.length) {
    // pack sentences [i, j) up to targetWords
    let j = i;
    let words = 0;
    while (j < units.length && (j === i || words + units[j].words <= cfg.targetWords)) {
      words += units[j].words;
      j++;
    }
    const startChar = units[i].start;
    const endChar = units[j - 1].end;
    chunks.push({ page, startChar, endChar, text: text.slice(startChar, endChar) });
    if (j >= units.length) break;
    // step back over whole trailing sentences for overlap, but always make progress
    let k = j;
    let back = 0;
    while (k - 1 > i && back + units[k - 1].words <= cfg.overlapWords) {
      back += units[k - 1].words;
      k--;
    }
    i = k;
  }
  return chunks;
}

/** Chunks every page independently. `pages[0]` is physical page 1. */
export function chunkPages(pages: string[], cfg: ChunkingConfig): TextChunk[] {
  return pages.flatMap((text, idx) => chunkPage(text, idx + 1, cfg));
}

function validate(cfg: ChunkingConfig) {
  if (!Number.isInteger(cfg.targetWords) || cfg.targetWords < 1) throw new Error(`targetWords must be a positive integer`);
  if (!Number.isInteger(cfg.overlapWords) || cfg.overlapWords < 0 || cfg.overlapWords >= cfg.targetWords)
    throw new Error(`overlapWords must be an integer in [0, targetWords)`);
}
