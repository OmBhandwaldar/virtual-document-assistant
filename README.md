# BeyondChats Assignment — AI-Powered Learning Assistant([Live App](https://virtual-document-assistant-fkj9.vercel.app/))([Demo Video](https://drive.google.com/file/d/1JWB3EN4FlL6XKZiTanmKvzipE2UXHdNI/view?usp=drive_link))

### Built by Om Bhandwaldar

---

## Overview

This project is an AI-powered Learning Assistant that enables students to upload, view, and interact with their study materials.
It supports PDF ingestion, quiz generation, progress tracking, and Retrieval-Augmented Generation (RAG) based intelligent Q&A.

Students/Users can upload course PDFs (like NCERT Physics books), generate quizzes, attempt them, track performance, and even chat with an AI tutor - all in one modern interface.

---

## Features


| Feature               | Description                                                                                                                  
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- 
| Source Selector       | Allows selecting between All PDFs or specific PDFs. Supports uploading new PDFs for embedding and quiz generation.          
| PDF Viewer            | Integrated viewer with zoom, pagination, and responsive layout beside chat.                                                   
| Quiz Generator Engine | Uses Gemini API to generate MCQs, SAQs, and LAQs. Automatically evaluates answers, provides explanations, and stores results. 
| Progress Tracking     | Tracks performance per chat (QuizAttempt table) with score, breakdown, and history.                                          
| Chat UI (Virtual Tutor) | ChatGPT-style interface with a sidebar for managing multiple chats.                                                        
| RAG Answers with Citations | AI answers user questions with page citations and quoted text from uploaded PDFs using pgvector similarity search.




---

## Tech Stack

| Layer      | Tools / Frameworks                                          |
| ---------- | ----------------------------------------------------------- |
| Frontend   | Next.js 14 (App Router), TypeScript, TailwindCSS, ShadCN/UI |
| Backend    | Next.js API Routes                              |
| Database   | Supabase PostgreSQL with pgvector                           |
| ORM        | Prisma ORM                                                  |
| AI / LLM   | Google Gemini API (Gemini 2.0 Flash + Embedding 001)        |
| Storage    | Supabase Storage                                            |
| Deployment | Vercel                                                      |


---

## Getting Started: High-Level Workflow

1. **Click "New Chat"** to create a chat session.  
2. **Select the chat** from the sidebar.  
3. **Go to the "PDFs" tab** in the sidebar.  
4. **Upload one or more PDFs** (one by one).  
5. **Ask questions** in the chat box.  
6. **Click "Generate Quiz"** to create a quiz from PDFs.  
7. **Repeat quiz generation** as needed.  
8. **View progress** in the "Progress" tab.


---

## About the RAG Pipeline

The system uses a Retrieval-Augmented Generation (RAG) approach to generate contextual answers and quizzes.

### RAG Flow

All ingestion goes through one module, `lib/ingest.ts`, used by `/api/upload`, `/api/pdfs/[id]/index`, the re-index script and the eval.

1. **PDF Upload:** Users upload PDFs to Supabase storage.
2. **Page-aware parsing:** Text is extracted **per page** with pdf-parse (pdf.js); running headers/footers are removed. Every chunk keeps its real (physical) page number.
3. **Chunking:** Each page is split into sentences, which are packed into chunks of up to ~500 words with ~75 words of whole-sentence overlap. Chunks never cross a page boundary and never cut a word. Size and overlap are configurable (`DEFAULT_CHUNKING` in `lib/ingest.ts`).
4. **Embedding:** Each chunk is embedded with `gemini-embedding-001` (1536 dimensions, task type `RETRIEVAL_DOCUMENT`). Failed batches are retried with exponential backoff; if a batch still fails, ingestion throws instead of silently storing fewer embeddings than chunks.
5. **Storage:** One embedding per chunk in a `pgvector(1536)` column, linked by `chunk_id`, with the chunk's full text and page.
6. **Retrieval:** The question is embedded with task type `RETRIEVAL_QUERY` and the nearest chunks are found by cosine similarity (`match_embeddings`, `lib/retrieve.ts`).
7. **Generation:** The retrieved excerpts (with PDF title and page) and the question are sent to Gemini 2.5 Flash, which answers with inline page citations.

This enables precise, explainable, and source-grounded responses.


---

## Retrieval Quality

Retrieval and citations are measured with a fixed eval set (`eval/`, details in [eval/README.md](eval/README.md)).

**What is measured.** 3 freely licensed PDFs (NIST CSF 2.0, NIST SP 800-63B, *Think Stats* 2e; 376 pages) and 50 questions, each labelled with the physical page that answers it (plus any other page that states the same answer, e.g. a summary table). For each question the eval runs the app's own retrieval (top 5, filtered to that PDF) and reports:

- **Citation accuracy:** share of returned citations whose cited page actually contains the cited text.
- **Recall@1 / Recall@5 / MRR@5 (cited page):** whether a chunk whose *cited* page answers the question is ranked first / in the top 5, and the mean reciprocal rank of the first one. This is what a user sees.
- **Recall@5 / MRR@5 (true page):** the same, but using the pages the chunk text *actually* comes from. This isolates "did search find the right passage" from "is the page label right".

<!-- eval-report:start (generated by `node eval/report.mjs`; do not edit by hand) -->
**Before / after** (50 questions, top-5, same frozen labels):

| Run | Citation accuracy | Recall@1 | Recall@5 | MRR@5 | Recall@5 (true page) | MRR@5 (true page) | Chunks |
|---|---|---|---|---|---|---|---|
| Before: [`baseline.json`](eval/results/baseline.json) (400 chars, 80 overlap) | 0.004 | 0.000 | 0.000 | 0.000 | 0.980 | 0.785 | 1808 |
| After: [`after.json`](eval/results/after.json) (500 words, 75 overlap) | 1.000 | 0.600 | 0.980 | 0.750 | 0.980 | 0.750 | 382 |

**Chunk-size sweep** (new pipeline, chosen default by MRR@5 = **500 words**):

| Run | Citation accuracy | Recall@1 | Recall@5 | MRR@5 | Recall@5 (true page) | MRR@5 (true page) | Chunks |
|---|---|---|---|---|---|---|---|
| [`sweep-200w.json`](eval/results/sweep-200w.json) (200 words, 30 overlap) | 1.000 | 0.620 | 0.940 | 0.749 | 0.940 | 0.749 | 715 |
| [`sweep-350w.json`](eval/results/sweep-350w.json) (350 words, 50 overlap) | 1.000 | 0.620 | 0.940 | 0.744 | 0.940 | 0.744 | 438 |
| [`sweep-500w.json`](eval/results/sweep-500w.json) (500 words, 75 overlap) | 1.000 | 0.600 | 0.980 | 0.750 | 0.980 | 0.750 | 382 |

Per-PDF MRR@5 (true page), showing the size trade-off between documents:

| Run | MRR@5 NIST.CSWP.29.pdf | MRR@5 nist.sp.800-63b.pdf | MRR@5 thinkstats2.pdf |
|---|---|---|---|
| baseline | 0.705 | 0.830 | 0.814 |
| sweep-200w | 0.729 | 0.760 | 0.757 |
| sweep-350w | 0.674 | 0.710 | 0.843 |
| sweep-500w | 0.754 | 0.652 | 0.843 |

Question by question (rank of the first relevant chunk, true page), after vs before:
12 better, 12 worse, 26 unchanged.
Repeatability: `after` and `sweep-500w` are two independent ingestions with the same config; 0 of 50 questions changed rank between them.

**Free-tier embedding loss (old pipeline):** with a free-tier Gemini key, the old upload route embedded
**100 of 1808 chunks**
(94% lost): its batches of 100
hit the 100 requests/min limit and failed batches were skipped without an error, leaving two of three PDFs
with no embeddings at all ([`baseline-freetier-asis.json`](eval/results/baseline-freetier-asis.json)). The new pipeline retries with backoff and fails loudly
instead; a test covers this (`npm test`).

Embeddings linked to their chunk: before 0 of 1808,
after 382 of 382.
Model `gemini-embedding-001`, 1536 dimensions
(task types before: none; after: `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`).
<!-- eval-report:end -->

**How to read this.**
- The fix is in **citations**: the old pipeline stored the chunk's *index* as its page, so almost every citation pointed to the wrong page even when the right passage was retrieved. With page-aware parsing and chunking, every returned citation points to the page that contains the cited text.
- **Finding the right passage did not improve.** True-page Recall@5 was already high before, and true-page MRR is slightly *lower* after; the question-by-question comparison above is mixed in both directions, so this is not presented as an improvement (nor as a clear regression, given 50 questions). The old 400-character chunks were very small, which helps exact-passage ranking but gives the LLM fragments that are cut mid-word and mid-sentence.
- **Chunk size:** the three sizes are close overall but trade off by document: larger chunks help the prose textbook and hurt the dense requirements document. The default was chosen by overall MRR@5 **on this same eval set; there is no separate held-out set**, so the choice may be slightly optimistic for other documents.
- Labels: drafted by an AI assistant, second-pass reviewed, and a random sample of 15 of 50 verified by hand (all correct); labels were frozen before any pipeline change. See [eval/README.md](eval/README.md).

**Chunking config used (after):** sentence-packed, ~500 words, ~75 words overlap, chunks confined to one page; `gemini-embedding-001`, 1536 dimensions.

**Reproduce:**

```bash
# put the 3 PDFs in eval/pdfs/ (sources in eval/README.md); needs .env with a paid-tier GEMINI_API_KEY
npm run eval -- --out eval/results/after.json --label after
npm run eval -- --out eval/results/sweep-200w.json --label "sweep 200w/30" --target-words 200 --overlap-words 30
node eval/report.mjs   # regenerates the tables above from eval/results/*.json
```

The `baseline*.json` results come from the pre-fix pipeline: `git checkout b0527af` and run `npm run eval -- --out eval/results/baseline.json --label baseline`.

---

## Architecture

```
User Uploads PDF → Stored in Supabase
          ↓
PDF Text Extracted → Chunked
          ↓
Gemini Embedding Model → Vector(1536)
          ↓
Stored in pgvector table "embeddings"
          ↓
RAG Query → Retrieve Similar Chunks
          ↓
Gemini Flash → Generate Contextual Answer or Quiz
          ↓
Frontend Displays → PDF, Chat, Quiz, Progress
```

---

## Database Schema

| Table       | Purpose                                      |
| ----------- | -------------------------------------------- |
| Pdf         | Stores metadata of uploaded PDFs             |
| Chunk       | Stores text chunks from PDFs                 |
| embeddings  | Stores embeddings of chunks (vector(1536))   |
| Quiz        | Stores quiz info per chat                    |
| Question    | Individual questions (MCQ, SAQ, LAQ)         |
| QuizAttempt | Records user quiz attempts, score, breakdown |
| Chat        | Chat session per user                        |
| Message     | Chat messages for AI Q&A                     |

---

## Core Backend APIs

### `/api/upload`

* Handles PDF upload to Supabase storage.
* Extracts text, creates chunks, generates embeddings, and stores them in DB.

### `/api/quiz/generate`

* Generates quizzes (MCQ/SAQ/LAQ) from all PDFs of the chat.
* Stores generated questions in Quiz and Question tables.

### `/api/quiz/submit`

* Evaluates user answers.
* Stores attempts in QuizAttempt.

### `/api/chat/query`

* Accepts a question, retrieves top-matching chunks from embeddings, and generates contextual answer with citations.

---

## Local Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/OmBhandwaldar/Virtual-Document-Assistant.git
cd Virtual-Document-Assistant
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Environment Variables

Create a `.env` file:

```env
DATABASE_URL=<your-supabase-postgres-url>
GEMINI_API_KEY=<your-gemini-api-key>
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### Step 4: Database schema (pgvector table, index and RPC functions)

pgvector must be available on the Supabase project. All tables, the `embeddings` vector table, its index and the `match_embeddings` / `get_chunks_without_embeddings` functions are created by the Prisma migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

### Step 5: Re-index existing PDFs (upgrading from the old pipeline)

PDFs indexed by the old pipeline have fake page numbers and unlinked embeddings. Re-index them once:

```bash
npm run reindex -- --dry-run   # list PDFs
npm run reindex                # re-parse, re-chunk, re-embed all PDFs
```

### Step 6: Tests

```bash
npm test
```

### Step 7: Run Locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)


---

## Progress Tracking

Each quiz submission is stored as a QuizAttempt:

* Tracks score, total, answers, and breakdown.
* Used to compute overall learning progress.
* Enables the user to review mistakes and explanations.


---

## Design Choices

| Decision                   | Reason                                           |
| -------------------------- | ------------------------------------------------ |
| Next.js App Router         | Simplifies API and frontend integration          |
| Gemini over OpenAI         | Better embedding integration and cost efficiency |
| Supabase Database/Storage | Easier management + built-in Postgres            |
| Manual chunking trigger    | Easier control for debugging                     |
| Vector size 1536           | Compatible with Gemini embeddings                |

---

## Future Enhancements

* One-click flowchart generation
* Export quiz results to PDF
* Multi-user authentication
* YouTube video recommender from YouTube API


---

## Development Summary

* Duration: 3 Days
* Approach: Step-by-step development of RAG → PDF handling → quiz generation → scoring.
* Tools Used: ChatGPT, Supabase SQL Editor, Prisma Studio, Gemini API, Vercel.
* Tested using NCERT Class XI Physics PDFs.

---

## Author

**Om Bhandwaldar**
Full Stack Web Developer | Next.js | Node.js | PostgreSQL | DevOps | AWS
Email: [ombhandwaldar@example.com](mailto:bhandwaldarom15@gmail.com)
LinkedIn: [linkedin.com/in/ombhandwaldar](https://linkedin.com/in/ombhandwaldar)

