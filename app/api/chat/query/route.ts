import { NextResponse } from "next/server";
import { gemini } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { retrieveChunks } from "@/lib/retrieve";

interface Citation {
  pdfId: string;
  page: number;
  chunkId: string | null;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { pdfIds, question, topK = 5 } = await req.json();

  if (!pdfIds?.length || !question)
    return NextResponse.json({ error: "Missing pdfIds or question" }, { status: 400 });

  // 1️⃣ Retrieve the most relevant chunks (query embedded with RETRIEVAL_QUERY)
  let matches;
  try {
    matches = await retrieveChunks(question, pdfIds, topK);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retrieval failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // 2️⃣ Build context with readable PDF titles and real page numbers
  const pdfs = await prisma.pdf.findMany({ where: { id: { in: pdfIds } }, select: { id: true, title: true } });
  const titleOf = new Map(pdfs.map((p) => [p.id, p.title]));
  const context = matches
    .map(
      (m, i) =>
        `Excerpt ${i + 1} (${titleOf.get(m.pdf_id) ?? m.pdf_id}, p.${m.page}): "${m.content.trim()}"`
    )
    .join("\n\n");

  const prompt = `
You are a helpful tutor that answers using only the provided excerpts.
When you use information, cite it inline as (PDF title, p.X) using the page shown for that excerpt.
If answer not found, reply “I couldn’t find that in the provided texts.”

Excerpts:
${context}

Question: ${question}
Answer:
`;

  // 3️⃣ Ask Gemini for the final answer
  const result = await gemini.models.generateContent({
    model: "models/gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const answer = result.text || "No answer generated.";

  return NextResponse.json({
    answer,
    citations: matches.map((m): Citation => ({ pdfId: m.pdf_id, page: m.page, chunkId: m.chunk_id })),
  });
}
