// eval/sample-for-review.mjs
// Draws a reproducible random sample of questions for human label verification.
// Usage: node eval/sample-for-review.mjs [n=15] [seed=20261115]
import fs from "node:fs";

const n = Number(process.argv[2] ?? 15);
const seed = Number(process.argv[3] ?? 20261115);

// mulberry32: small deterministic PRNG so the sample is reproducible from the seed
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const qs = JSON.parse(fs.readFileSync("eval/questions.json", "utf8"));
const rand = mulberry32(seed);
const idx = qs.map((_, i) => i);
for (let i = idx.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [idx[i], idx[j]] = [idx[j], idx[i]];
}
const sample = idx.slice(0, n).sort((a, b) => a - b).map((i) => qs[i]);

console.log(`Seed ${seed}, ${n} of ${qs.length} questions\n`);
sample.forEach((q, k) => {
  console.log(`${k + 1}. [${q.id}] ${q.pdfFile} — page ${q.answerPage}`);
  console.log(`   Q: ${q.question}`);
  console.log(`   Snippet: "${q.answerSnippet}"`);
  for (const a of q.acceptablePages ?? []) console.log(`   Also accepted: page ${a.page} — "${a.snippet}"`);
  console.log();
});
