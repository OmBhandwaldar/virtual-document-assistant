import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// ✅ Create new chat
export async function POST(req: Request) {
  try {
    const { title } = await req.json();

    const chat = await prisma.chat.create({
      data: {
        title: title || "New Chat",
      },
    });

    return NextResponse.json(chat, { status: 201 });
  } catch (err: unknown) {
    console.error("Chat creation error:", err);
    return NextResponse.json({ error: "Failed to create chat" }, { status: 500 });
  }
}

// (optional)
export async function GET() {
  try {
    const all = await prisma.chat.findMany({
      orderBy: { createdAt: "desc" },
    });
    // Hide internal chats such as "__rag_eval__". Filtered in JS: in SQL LIKE, "_" is a wildcard.
    const chats = all.filter((c) => !c.title.startsWith("__"));
    return NextResponse.json(chats);
  } catch (err: unknown) {
    console.error("Error fetching chats:", err);
    return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 });
  }
}
