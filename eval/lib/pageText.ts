// eval/lib/pageText.ts
// Ground-truth per-page text for the eval PDFs, used to work out which physical
// pages a retrieved chunk really comes from. Two parsers are used because the
// pipeline under test may use either; a chunk is located in whichever parser's
// text it matches. Matching is done on a normalised form (lowercase a-z0-9 only),
// so whitespace, hyphenation and punctuation differences between parsers don't matter.
import { createRequire } from "node:module";
import { PDFParse } from "pdf-parse";

const require = createRequire(import.meta.url);

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface PageIndex {
  parser: string;
  pages: string[]; // normalised text per page, index 0 = page 1
  doc: string; // concatenation of pages
  starts: number[]; // offset of each page in doc
}

function buildIndex(parser: string, rawPages: string[]): PageIndex {
  const pages = rawPages.map(norm);
  const starts: number[] = [];
  let off = 0;
  for (const p of pages) {
    starts.push(off);
    off += p.length;
  }
  return { parser, pages, doc: pages.join(""), starts };
}

async function pdf2jsonPages(buf: Buffer): Promise<string[]> {
  const PDFParser = require("pdf2json");
  return new Promise((resolve, reject) => {
    const p = new PDFParser(null, true);
    p.on("pdfParser_dataError", (e: { parserError?: unknown }) => reject(e?.parserError ?? e));
    p.on("pdfParser_dataReady", (data: { Pages?: { Texts?: { R?: { T?: string }[] }[] }[] }) => {
      resolve(
        (data.Pages ?? []).map((page) =>
          (page.Texts ?? [])
            .flatMap((t) => (t.R ?? []).map((r) => safeDecode(r.T ?? "")))
            .join(" ")
        )
      );
    });
    p.parseBuffer(buf);
  });
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function pdfParsePages(buf: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const { pages } = await parser.getText();
  await (parser as unknown as { destroy?: () => Promise<void> }).destroy?.();
  return pages.map((p: { text: string }) => p.text);
}

export async function buildPageIndexes(buf: Buffer): Promise<PageIndex[]> {
  return [buildIndex("pdf-parse", await pdfParsePages(buf)), buildIndex("pdf2json", await pdf2jsonPages(buf))];
}

function pageAt(idx: PageIndex, offset: number): number {
  // binary search: last page whose start <= offset; returns 1-based page
  let lo = 0,
    hi = idx.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (idx.starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Returns the 1-based physical pages a chunk's text spans, or null if it can't be
 * located. Looks up several probe windows from the chunk (start, middle, end) so a
 * chunk is still located if a few characters differ between parsers.
 */
export function locateChunk(text: string, indexes: PageIndex[]): { pages: number[]; parser: string } | null {
  const n = norm(text);
  if (n.length < 20) return null;
  const W = Math.min(60, n.length);
  const probes = [0, Math.floor((n.length - W) / 2), n.length - W];
  for (const idx of indexes) {
    const whole = idx.doc.indexOf(n);
    if (whole >= 0) return { pages: range(pageAt(idx, whole), pageAt(idx, whole + n.length - 1)), parser: idx.parser };
    const hits: number[] = [];
    for (const p of probes) {
      const at = idx.doc.indexOf(n.slice(p, p + W));
      if (at >= 0) hits.push(at - p);
    }
    if (hits.length) {
      // use the median implied start position across probes that matched
      hits.sort((a, b) => a - b);
      const start = Math.max(0, hits[Math.floor(hits.length / 2)]);
      const end = Math.min(idx.doc.length - 1, start + n.length - 1);
      return { pages: range(pageAt(idx, start), pageAt(idx, end)), parser: idx.parser };
    }
  }
  return null;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
