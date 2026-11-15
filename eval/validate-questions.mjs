// eval/validate-questions.mjs
// Checks every entry in eval/questions.json against the per-page text produced by
// eval/extract-pages.mjs:
//   - answerSnippet must appear on answerPage (whitespace/punctuation-insensitive)
//   - warns if the snippet also appears on other pages (ambiguous label)
//   - reports lexical overlap between question and snippet (lower = less keyword-matchable)
//
// Usage: node eval/extract-pages.mjs && node eval/validate-questions.mjs
import fs from "node:fs";
import path from "node:path";

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const STOP = new Set("a an the of to in on for and or is are be by with what which how why when does do can that this it its as at from into than more most should must may used use its their there one".split(" "));
const words = (s) => new Set(s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []);

const questions = JSON.parse(fs.readFileSync("eval/questions.json", "utf8"));
const cache = new Map();
function pages(pdfFile) {
  if (!cache.has(pdfFile)) {
    const txt = fs.readFileSync(path.join("eval/.pages", pdfFile.replace(/\.pdf$/i, ".txt")), "utf8");
    const parts = txt.split(/=== PAGE (\d+) ===\n/).slice(1);
    const map = new Map();
    for (let i = 0; i < parts.length; i += 2) map.set(Number(parts[i]), norm(parts[i + 1]));
    cache.set(pdfFile, map);
  }
  return cache.get(pdfFile);
}

let errors = 0;
const ids = new Set();
for (const q of questions) {
  if (ids.has(q.id)) { console.log(`DUP ID ${q.id}`); errors++; }
  ids.add(q.id);
  const p = pages(q.pdfFile);
  const s = norm(q.answerSnippet);
  const found = [...p.entries()].filter(([, t]) => t.includes(s)).map(([n]) => n);
  const ok = found.includes(q.answerPage);
  const others = found.filter((n) => n !== q.answerPage);
  const qw = words(q.question), sw = words(q.answerSnippet);
  const overlap = [...qw].filter((w) => sw.has(w));
  if (!ok) errors++;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${q.id.padEnd(7)} p${String(q.answerPage).padEnd(4)}` +
      (ok ? "" : ` snippet found on: [${found.join(",") || "none"}]`) +
      (others.length && ok ? ` WARN also on [${others.join(",")}]` : "") +
      `  overlap=${overlap.length}/${qw.size} ${overlap.length ? "(" + overlap.join(",") + ")" : ""}`
  );
}
console.log(`\n${questions.length} questions, ${errors} errors`);
process.exit(errors ? 1 : 0);
