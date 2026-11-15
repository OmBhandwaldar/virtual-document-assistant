// eval/extract-pages.mjs
// Dumps per-page text for every PDF in eval/pdfs, used to draft and verify the
// eval labels. Pages are 1-based physical PDF pages.
//
// Ground truth uses pdf-parse (pdf.js), which preserves inter-word spacing.
// pdf2json (the app's current parser) is run too, only to assert both parsers
// agree on the page count, so page numbers mean the same thing for both.
//
// Usage: node eval/extract-pages.mjs [outDir]   (default: eval/.pages)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { PDFParse } from "pdf-parse";

const require = createRequire(import.meta.url);
const PDFParser = require("pdf2json");

const pdfDir = path.resolve("eval/pdfs");
const outDir = path.resolve(process.argv[2] ?? "eval/.pages");
fs.mkdirSync(outDir, { recursive: true });

function pdf2jsonPageCount(buf) {
  return new Promise((resolve, reject) => {
    const p = new PDFParser(null, true);
    p.on("pdfParser_dataError", (e) => reject(e?.parserError ?? e));
    p.on("pdfParser_dataReady", (data) => resolve((data.Pages ?? []).length));
    p.parseBuffer(buf);
  });
}

for (const f of fs.readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith(".pdf"))) {
  const buf = fs.readFileSync(path.join(pdfDir, f));
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const { pages } = await parser.getText();
  await parser.destroy?.();
  const n2j = await pdf2jsonPageCount(buf);
  const out = pages
    .map((p, i) => `=== PAGE ${i + 1} ===\n${p.text.replace(/\s+/g, " ").trim()}`)
    .join("\n\n");
  fs.writeFileSync(path.join(outDir, f.replace(/\.pdf$/i, ".txt")), out);
  console.log(`${f}: pdf-parse ${pages.length} pages, pdf2json ${n2j} pages${pages.length === n2j ? "" : "  <-- MISMATCH"}`);
}
