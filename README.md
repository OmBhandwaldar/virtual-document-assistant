# AI-Powered Learning Assistant ([Live App](https://virtual-document-assistant-fkj9.vercel.app/))

Upload course PDFs, ask questions and get answers that cite the exact page they come from, then test yourself with generated quizzes and track your scores.

---

## Features

| Feature | Description |
| --- | --- |
| Page-cited answers | The tutor answers only from your PDFs. Inline references such as *(Document, p. 9)* are clickable and open the PDF at that page. The passages retrieved for each answer are listed under it. |
| Side-by-side reader | PDF viewer beside the conversation with page navigation, a page-number field, zoom and fit-to-width. On phones it opens as a full-screen sheet. |
| Sessions and documents | Each session has its own documents. Upload by drag-and-drop or file picker; each document shows its page count and indexing status, and can be re-indexed. Ask about one document or all documents in the session. |
| Quizzes | Generate multiple-choice, short-answer and long-answer questions from a session's documents. Multiple-choice answers are marked automatically; written answers are shown next to a model answer for self-review, with an explanation for every question. |
| Progress | Quizzes taken, average score, change over time, a score chart and an attempt log for the session. |
| Light and dark themes | Both designed together; the theme follows the system setting and can be switched in the header. |

---

## Using the App

1. Click **New session**, or drop a PDF on **Add a PDF**, which starts a session for you.
2. Wait for the document to show **Indexed**. Large PDFs take a little longer.
3. Ask a question in **Ask**. Click a page reference in the answer to open that page beside the conversation.
4. To ask about a single document, select it in the sidebar. Select **All documents** to ask across all of them.
5. Open **Quiz**, choose the mix of question types and click **Generate quiz**. Press A–D to choose a multiple-choice answer.
6. Open **Progress** to see your scores for the session.

---

## Design System

The interface uses a "Paper & Ink" system defined as semantic tokens in `app/globals.css`:

- **Color:** warm paper surfaces, near-black ink for text and primary actions, and one ochre highlight reserved for citations, focus and the active item. Green and red are used only for quiz correctness and always come with an icon. Dark mode uses warm charcoal rather than inverted colors.
- **Type:** Newsreader for headings and the tutor's long-form answers, Geist for interface text, and Geist Mono with tabular figures for numbers and page references.
- **Surfaces:** frosted glass is used only for chrome that floats over scrolling content (header, composer, mobile overlay); content sits on solid cards.
- **Accessibility:** visible focus rings, a skip link, labelled icon buttons, keyboard answer keys in quizzes, and `prefers-reduced-motion` support.

---

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, react-pdf, Recharts, Sonner |
| Backend | Next.js Route Handlers |
| Database | Supabase PostgreSQL with pgvector |
| ORM | Prisma |
| AI | Google Gemini: `gemini-embedding-001` for embeddings; `gemini-3.8-flash` (configurable) for answers and quizzes |
| PDF parsing | pdf-parse (pdf.js) |
| Storage | Supabase Storage |
| Deployment | Vercel |

---

## RAG Pipeline

All ingestion goes through one module, `lib/ingest.ts`, used by `/api/upload`, `/api/pdfs/[id]/index`, the re-index script and the eval.

1. **Upload:** the PDF is stored in Supabase Storage.
2. **Page-aware parsing:** text is extracted **per page** with pdf-parse (pdf.js), and running headers and footers are removed. Every chunk keeps its real (physical) page number.
3. **Chunking:** each page is split into sentences, which are packed into chunks of up to about 500 words with about 75 words of whole-sentence overlap. Chunks never cross a page boundary and never cut a word. Size and overlap are configurable (`DEFAULT_CHUNKING` in `lib/ingest.ts`).
4. **Embedding:** each chunk is embedded with `gemini-embedding-001` (1536 dimensions, task type `RETRIEVAL_DOCUMENT`). Failed batches are retried with exponential backoff; if a batch still fails, ingestion throws instead of silently storing fewer embeddings than chunks, and nothing is written.
5. **Storage:** one embedding per chunk in a `vector(1536)` column, linked by `chunk_id`, with the chunk's full text and page.
6. **Retrieval:** the question is embedded with task type `RETRIEVAL_QUERY`, and the nearest chunks are found by cosine similarity (`match_embeddings`, `lib/retrieve.ts`).
7. **Generation:** the retrieved excerpts, labelled with document title and page, are sent with the question to Gemini (`GENERATION_MODEL` in `lib/gemini.ts`), which answers with inline page citations.

```
PDF upload → Supabase Storage
     ↓
per-page text (pdf-parse) → sentence chunks within each page
     ↓
gemini-embedding-001 (RETRIEVAL_DOCUMENT) → vector(1536), linked to its chunk
     ↓
question → gemini-embedding-001 (RETRIEVAL_QUERY) → match_embeddings (top 5)
     ↓
Gemini → answer with (Document, p. N) citations → clickable pages in the UI
```

---

## Retrieval Quality

Retrieval and citations are measured with a fixed eval set (`eval/`, details in [eval/README.md](eval/README.md)).

**What is measured.** Three freely licensed PDFs (NIST CSF 2.0, NIST SP 800-63B, *Think Stats* 2e) and a set of questions, each labelled with the physical page that answers it, plus any other page that states the same answer (e.g. a summary table). For each question the eval runs the app's own retrieval (top 5, filtered to that PDF) and reports:

- **Citation accuracy:** share of returned citations whose cited page actually contains the cited text.
- **Recall@1 / Recall@5 / MRR@5 (cited page):** whether a chunk whose *cited* page answers the question is ranked first or in the top 5, and the mean reciprocal rank of the first one. This is what a user sees.
- **Recall@5 (true page):** the same check using the pages the chunk text actually comes from, which confirms the cited pages are the real ones.

<!-- eval-report:start (generated by `node eval/report.mjs`; do not edit by hand) -->
**Results** ([`after.json`](eval/results/after.json): 50 questions over 3 PDFs / 376 pages, top-5, 500 words, 75 overlap):

| Metric | Value |
|---|---|
| **Citation accuracy** | **1.000** (250 citations checked) |
| **Recall@1** (cited page) | **0.600** |
| **Recall@5** (cited page) | **0.980** |
| **MRR@5** (cited page) | **0.750** |
| Recall@5 (true page) | 0.980 |

| Document | Recall@1 | Recall@5 | MRR@5 |
|---|---|---|---|
| `NIST.CSWP.29.pdf` | 0.625 | 1.000 | 0.754 |
| `nist.sp.800-63b.pdf` | 0.412 | 1.000 | 0.652 |
| `thinkstats2.pdf` | 0.765 | 0.941 | 0.843 |

**Chunk-size sweep** (default chosen by MRR@5: **500 words**):

| Run | Chunk size | Chunks | Citation accuracy | Recall@1 | Recall@5 | MRR@5 |
|---|---|---|---|---|---|---|
| [`sweep-200w.json`](eval/results/sweep-200w.json) | 200 words, 30 overlap | 715 | 1.000 | 0.620 | 0.940 | 0.749 |
| [`sweep-350w.json`](eval/results/sweep-350w.json) | 350 words, 50 overlap | 438 | 1.000 | 0.620 | 0.940 | 0.744 |
| [`sweep-500w.json`](eval/results/sweep-500w.json) | 500 words, 75 overlap | 382 | 1.000 | 0.600 | 0.980 | 0.750 |

MRR@5 per document, showing how chunk size trades off between document types:

| Run | `NIST.CSWP.29.pdf` | `nist.sp.800-63b.pdf` | `thinkstats2.pdf` |
|---|---|---|---|
| sweep-200w | 0.729 | 0.760 | 0.757 |
| sweep-350w | 0.674 | 0.710 | 0.843 |
| sweep-500w | 0.754 | 0.652 | 0.843 |

Repeatability: `after` and `sweep-500w` are two independent ingestions with the same config; 0 of 50 questions changed rank between them.
Every embedding is linked to its chunk (382 of 382); model `gemini-embedding-001`, 1536 dimensions, task types `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`.
<!-- eval-report:end -->

**Notes.**
- **Chunk size:** the three sizes are close overall but trade off by document: larger chunks help the prose textbook and hurt the dense requirements document. The default was chosen by overall MRR@5 **on this same eval set; there is no separate held-out set**, so the choice may be slightly optimistic for other documents.
- **Labels:** drafted by an AI assistant, second-pass reviewed, and a random sample verified by hand (all correct). Labels were frozen before any pipeline change. See [eval/README.md](eval/README.md).

**Reproduce:**

```bash
# put the 3 PDFs in eval/pdfs/ (sources in eval/README.md); needs a paid-tier GEMINI_API_KEY
npm run eval -- --out eval/results/after.json --label after
npm run eval -- --out eval/results/sweep-200w.json --label "sweep 200w/30" --target-words 200 --overlap-words 30
node eval/report.mjs   # regenerates the tables above from eval/results/*.json
```

---

## Database Schema

| Table | Purpose |
| --- | --- |
| Chat | A study session |
| Pdf | Uploaded document: storage path, page count, indexing time |
| Chunk | Text chunk with its page and character offsets on that page |
| embeddings | One `vector(1536)` per chunk, linked by `chunk_id`, with the chunk's text and page |
| Quiz | A generated quiz for a session |
| Question | MCQ, short-answer or long-answer question with answer and explanation |
| QuizAttempt | Submitted answers, score and per-question breakdown |
| Message | Reserved for chat history (not currently written) |

The `embeddings` table, its vector index and the `match_embeddings` / `get_chunks_without_embeddings` functions are created by the Prisma migrations in `prisma/migrations/`.

---

## API

| Route | Purpose |
| --- | --- |
| `POST /api/upload` | Stores the PDF, then parses, chunks, embeds and indexes it. Returns an error (and stores no chunks) if indexing fails. |
| `POST /api/pdfs/[id]/index` | Re-indexes a stored PDF, replacing its chunks and embeddings. |
| `GET /api/pdfs?chatId=` | Documents of a session, with page count and indexing status. |
| `GET /api/pdfs/[id]/metadata` | Signed URL for viewing a PDF. |
| `GET, POST /api/chats` | List sessions / create a session. |
| `POST /api/chat/query` | Retrieves the top passages for a question and returns an answer plus citations (`pdfId`, `page`, `chunkId`). |
| `POST /api/quiz/generate` | Generates MCQ, short-answer and long-answer questions from a session's documents. |
| `POST /api/quiz/submit` | Marks answers and stores a QuizAttempt. MCQs are matched against the correct option; written answers are matched exactly, so the UI shows them for self-review instead of marking them. |

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/OmBhandwaldar/Virtual-Document-Assistant.git
cd Virtual-Document-Assistant
npm install
```

### 2. Environment variables

Create a `.env` file:

```env
DATABASE_URL=<your-supabase-postgres-url>
GEMINI_API_KEY=<your-gemini-api-key>
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
# optional: model for answers and quizzes (default gemini-3.8-flash)
GEMINI_GENERATION_MODEL=
```

A paid-tier Gemini key is recommended. The free tier's embedding rate limit is too low for indexing large PDFs; ingestion will stop with an error rather than store an incomplete index.

### 3. Database

pgvector must be enabled on the Supabase project. Create a storage bucket named `pdfs`, then apply the migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

### 4. Run

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm test` | Unit tests for chunking and ingestion (failed embedding batches must throw; one embedding per chunk) |
| `npm run eval` | Run the retrieval eval (see Retrieval Quality) |
| `npm run reindex` | Re-index stored PDFs with the current pipeline (`-- --dry-run` to list, `-- --pdf <id>` for one) |

---

## Design Choices

| Decision | Reason |
| --- | --- |
| Chunks confined to one page | Every chunk has exactly one real page to cite |
| Sentence-based chunking with overlap | No words or sentences cut in half; neighbouring context carried over |
| Separate document and query task types | Gemini embeddings are optimised differently for passages and questions |
| Embed everything before writing to the database | A failure never leaves a half-indexed document |
| One shared ingestion module | Upload, re-index, scripts and the eval run identical code |
| Supabase Postgres + pgvector + Storage | Vectors, relational data and files in one managed service |
| Vector size 1536 | Supported `gemini-embedding-001` output size that fits the existing index |
