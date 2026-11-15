import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkPage, chunkPages, splitSentences } from "@/lib/chunker";

const words = (s: string) => s.split(/\s+/).filter(Boolean);

test("splitSentences keeps abbreviations, decimals and section numbers inside sentences", () => {
  const t = "See Fig. 2 and e.g. the U.S. data. The mean is 38.6 weeks. Steps 1. 2. and 3. follow! Next one?";
  const s = splitSentences(t).map((x) => t.slice(x.start, x.end));
  assert.deepEqual(s, [
    "See Fig. 2 and e.g. the U.S. data.",
    "The mean is 38.6 weeks.",
    "Steps 1. 2. and 3. follow!",
    "Next one?",
  ]);
});

test("chunks respect targetWords, never cut words, and map back to the page text", () => {
  const text = Array.from({ length: 60 }, (_, i) => `This is sentence ${i} with several extra words here.`).join(" ");
  const chunks = chunkPage(text, 7, { targetWords: 50, overlapWords: 10 });
  const pageWords = new Set(words(text));
  for (const c of chunks) {
    assert.equal(c.page, 7);
    assert.equal(text.slice(c.startChar, c.endChar), c.text, "offsets point at the chunk text");
    assert.ok(words(c.text).length <= 50);
    for (const w of words(c.text)) assert.ok(pageWords.has(w), `"${w}" is a whole word from the page`);
    assert.match(c.text, /^This/, "chunks start at a sentence boundary");
    assert.match(c.text, /\.$/, "chunks end at a sentence boundary");
  }
  // overlap: each chunk after the first starts with the last sentence(s) of the previous one
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].startChar < chunks[i - 1].endChar, "consecutive chunks overlap");
  }
  // full coverage
  assert.equal(chunks[0].startChar, 0);
  assert.equal(chunks.at(-1)!.endChar, text.length);
});

test("an over-long sentence is split on word boundaries", () => {
  const text = Array.from({ length: 250 }, (_, i) => `word${i}`).join(" ");
  const chunks = chunkPage(text, 1, { targetWords: 100, overlapWords: 0 });
  assert.deepEqual(chunks.map((c) => words(c.text).length), [100, 100, 50]);
  assert.equal(chunks.map((c) => c.text).join(" "), text);
});

test("chunkPages never crosses page boundaries and uses 1-based physical pages", () => {
  const pages = ["Alpha one. Alpha two.", "", "Gamma one. Gamma two. Gamma three."];
  const chunks = chunkPages(pages, { targetWords: 4, overlapWords: 0 });
  assert.deepEqual(
    chunks.map((c) => [c.page, c.text]),
    [
      [1, "Alpha one. Alpha two."],
      [3, "Gamma one. Gamma two."],
      [3, "Gamma three."],
    ]
  );
});

test("invalid config is rejected", () => {
  assert.throws(() => chunkPage("x.", 1, { targetWords: 10, overlapWords: 10 }));
  assert.throws(() => chunkPage("x.", 1, { targetWords: 0, overlapWords: 0 }));
});
