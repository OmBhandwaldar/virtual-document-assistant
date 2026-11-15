// lib/pdfParser.ts
// Page-aware PDF text extraction.
//
// Uses pdf-parse (pdf.js), which keeps inter-word spacing. The previous pdf2json-based
// parser dropped spaces for some PDFs (e.g. LaTeX books came out as
// "Thisbookisanintroduction...") and discarded page boundaries, which made real page
// citations impossible.

export interface ParsedPdf {
  /** Cleaned text per page; index 0 is physical page 1. */
  pages: string[];
}

export async function parsePdfPages(bufferOrUint8: ArrayBuffer | Uint8Array | Buffer): Promise<ParsedPdf> {
  const { PDFParse } = await import("pdf-parse");
  const data =
    bufferOrUint8 instanceof Uint8Array ? new Uint8Array(bufferOrUint8) : new Uint8Array(bufferOrUint8);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const raw = result.pages.map((p: { text: string }) => p.text ?? "");
    return { pages: cleanPages(raw) };
  } finally {
    await (parser as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

/**
 * Normalises page text:
 *  - joins words hyphenated across a line break ("anal-\nysis" -> "analysis")
 *  - removes running headers/footers (lines repeated at the top/bottom of many pages,
 *    ignoring digits so "Page 7" and "Page 8" match)
 *  - collapses whitespace
 */
export function cleanPages(rawPages: string[]): string[] {
  const linesPerPage = rawPages.map((t) =>
    t
      .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  );

  const EDGE = 4; // lines at the top and bottom of a page considered for header/footer detection
  const key = (l: string) => l.replace(/\d+/g, "#").toLowerCase();
  const counts = new Map<string, number>();
  for (const lines of linesPerPage) {
    const edge = new Set([...lines.slice(0, EDGE), ...lines.slice(-EDGE)].map(key));
    for (const k of edge) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const minRepeats = Math.max(3, Math.ceil(rawPages.length * 0.4));
  const boilerplate = new Set([...counts].filter(([, c]) => c >= minRepeats).map(([k]) => k));

  return linesPerPage.map((lines) => {
    const kept = lines.filter((l, i) => {
      const atEdge = i < EDGE || i >= lines.length - EDGE;
      return !(atEdge && boilerplate.has(key(l)));
    });
    return kept.join(" ").replace(/\s+/g, " ").trim();
  });
}
