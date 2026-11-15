// app/api/pdfs/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseClient";

export async function GET(req: Request) {
  const supabase = supabaseServer();

  // ✅ Extract chatId from query params
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");

  try {
    // ✅ Base query
    let query = supabase
      .from("Pdf")
      .select("id, title, filename, preview, uploadedAt, chatId, pages, indexedAt, Chat(title)")
      .order("uploadedAt", { ascending: false });

    // ✅ If chatId provided, filter PDFs belonging to that chat
    if (chatId) {
      query = query.eq("chatId", chatId);
    }

    const { data: rows, error } = await query;
    // Hide documents that belong to internal chats (e.g. "__rag_eval__", the retrieval eval).
    const data = (rows ?? [])
      .filter((r) => !String((r as { Chat?: { title?: string } | null }).Chat?.title ?? "").startsWith("__"))
      .map((r) => {
        const row = { ...(r as Record<string, unknown>) };
        delete row.Chat;
        return row;
      });

    if (error) {
      console.error("Error fetching PDFs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("Unexpected error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}



// import { NextResponse } from "next/server";
// import { supabaseServer } from "@/lib/supabaseClient";

// export async function GET() {
//   const supabase = supabaseServer();
//   const { data, error } = await supabase
//     .from("Pdf")
//     .select("id, title, filename, preview, uploadedAt")
//     .order("uploadedAt", { ascending: false });


//   if (error)
//     return NextResponse.json({ error: error.message }, { status: 500 });

//   return NextResponse.json(data);
// }
