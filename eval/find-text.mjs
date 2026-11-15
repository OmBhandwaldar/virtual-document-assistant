// eval/find-text.mjs — find which pages contain a phrase (whitespace/punctuation-insensitive).
// Usage: node eval/find-text.mjs eval/.pages/<pdf>.txt "phrase" ["phrase2" ...]

import fs from "node:fs";
const [file, ...terms] = process.argv.slice(2);
const pages = fs.readFileSync(file, "utf8").split(/=== PAGE (\d+) ===\n/).slice(1);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
for (const t of terms) {
  const hits = [];
  for (let i = 0; i < pages.length; i += 2) {
    const raw = pages[i + 1], idx = raw.toLowerCase().indexOf(t.toLowerCase());
    if (norm(raw).includes(norm(t))) hits.push(pages[i] + (idx >= 0 ? `: …${raw.slice(Math.max(0, idx - 300), idx + 500)}…` : ""));
  }
  console.log(`## ${t}\n` + hits.join("\n") + "\n");
}
