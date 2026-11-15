# Retrieval eval

Measures how well the RAG pipeline retrieves the right passage for a question, and
whether the page numbers it cites are correct.

## Reproduce

```bash
# 1. Put the eval PDFs in eval/pdfs/ (not committed, see "Corpus")
# 2. .env must contain GEMINI_API_KEY, DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
node eval/extract-pages.mjs          # per-page text -> eval/.pages/ (for labelling / validation)
node eval/validate-questions.mjs     # check every label against the page text
npm run eval -- --out eval/results/<name>.json --label <name>
```

`npm run eval` ingests the PDFs through the app's real ingestion code into a dedicated chat
titled `__rag_eval__`. Each run deletes and re-creates only that chat's PDFs, chunks,
embeddings and storage files; nothing else in the database is touched. `--skip-ingest`
re-scores the existing eval ingestion without re-embedding.

A full ingestion is ~1,800 embedding requests (baseline chunking). A free-tier Gemini key
(100 embed requests/min) is not enough: the baseline pipeline silently drops failed batches
(see `results/baseline-freetier-asis.json`). Results in this folder were produced with a
paid (Tier 1) key.

## Corpus

| File | Pages | Source / license |
|---|---|---|
| `NIST.CSWP.29.pdf` | 32 | NIST Cybersecurity Framework 2.0, US Government work (public domain) |
| `nist.sp.800-63b.pdf` | 80 | NIST SP 800-63B (Rev. 3, withdrawn edition), US Government work (public domain) |
| `thinkstats2.pdf` | 264 | Allen B. Downey, *Think Stats* 2e v2.2.1, Green Tea Press (CC BY-NC-SA) |

## Questions (`questions.json`)

50 questions: 16 CSF, 17 SP 800-63B, 17 Think Stats; 25 factual, 8 definition, 17 concept.

- `answerPage` is the 1-based **physical** page in the PDF file (not the printed page number).
- `answerSnippet` is verbatim text from that page; `validate-questions.mjs` checks it is on
  that page and on no other page (comparison ignores whitespace and punctuation).
- `acceptablePages` lists other pages that also state the answer (e.g. a summary table or a
  glossary entry), each with an evidence snippet that the validator checks. A retrieved
  chunk on one of these pages also counts as a hit.
- Questions were paraphrased to avoid copying the source wording; the validator reports
  word overlap between each question and its answer text.

**Labelling provenance:** questions and labels were drafted by an AI assistant (Claude) by
reading the extracted page text, then given a second review pass that searched every
answer's key terms across all pages to find other pages that also state the answer. They
have not been independently verified by a human.
Labels were frozen before any pipeline change; they were not adjusted based on eval results.

## Metrics

For each question the eval runs the same retrieval as `app/api/chat/query`: embed the question,
call the `match_embeddings` RPC with top-k = 5, filtered to that question's PDF.
Relevant pages R = {answerPage} ∪ acceptablePages.

| Metric | Definition |
|---|---|
| Recall@1, Recall@5, MRR@5 | A retrieved chunk is a hit if the page **stored for it** (the page the app cites) is in R. This is what a user sees. |
| `*_truePage` variants | A retrieved chunk is a hit if the pages its text **actually spans** intersect R. The span is found by locating the chunk text in the per-page PDF text (pdf-parse and pdf2json, normalised). This separates retrieval quality from page-labelling bugs. A chunk that crosses a page boundary counts for both pages. |
| Citation accuracy | Over all returned citations `{pdfId, page}`: share whose cited page actually contains (part of) the cited chunk text. |

Each results file also records the pipeline config (parser, chunking, embedding model,
dimension observed in the DB, task types), corpus stats (pages, chunks, embeddings,
embeddings linked to a chunk), the git commit, and per-question ranked results.
