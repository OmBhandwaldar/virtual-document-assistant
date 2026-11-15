"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Menu, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import Sidebar from "@/components/Sidebar";
import PDFViewer from "@/components/PDFViewer";
import ChatInterface from "@/components/ChatInterface";
import QuizGenerator from "@/components/QuizGenerator";
import ProgressDashboard from "@/components/ProgressDashboard";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Chat, Citation, Message, PDFRecord, QuestionTypes, QuizAnswer, View } from "@/lib/types";

const VIEW_TITLE: Record<View, string> = { chat: "Ask", quiz: "Quiz", progress: "Progress" };
// On small screens the document is a full-screen sheet, so only open it when the user asks.
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [pdfs, setPdfs] = useState<PDFRecord[]>([]);
  const [scopePdf, setScopePdf] = useState<string | null>(null); // null = all documents in the session
  const [view, setView] = useState<View>("chat");
  const [isAsking, setIsAsking] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // document panel
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPdf, setViewerPdf] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState(1);
  const [jumpKey, setJumpKey] = useState(0);
  const urlCache = useRef(new Map<string, string>());

  const chat = chats.find((c) => c.id === activeChat) ?? null;

  /* ---------- data ---------- */

  const loadPdfs = useCallback(async (chatId: string | null) => {
    if (!chatId) {
      setPdfs([]);
      return [];
    }
    try {
      const res = await fetch(`/api/pdfs?chatId=${chatId}`);
      const data = await res.json();
      const list: PDFRecord[] = Array.isArray(data) ? data : [];
      setPdfs(list);
      return list;
    } catch {
      toast.error("Couldn't load documents", { description: "Check your connection and try again." });
      return [];
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/chats");
        const data = await res.json();
        if (!Array.isArray(data)) return;
        const loaded: Chat[] = data.map((c: { id: string; title: string; createdAt: string }) => ({
          id: c.id,
          title: c.title,
          timestamp: new Date(c.createdAt),
          messages: [],
          quizHistory: [],
        }));
        setChats(loaded);
        if (loaded[0]) selectChat(loaded[0].id, false);
      } catch {
        /* first load without sessions is fine */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openInViewer = useCallback(async (pdfId: string, page = 1, jump = false, reveal = true) => {
    setViewerPdf(pdfId);
    setViewerPage(page);
    if (reveal) setViewerOpen(true);
    if (jump) setJumpKey((k) => k + 1);
    const cached = urlCache.current.get(pdfId);
    if (cached) {
      setViewerUrl(cached);
      return;
    }
    setViewerUrl(null);
    try {
      const res = await fetch(`/api/pdfs/${pdfId}/metadata`);
      const data = await res.json();
      if (!res.ok || !data.signedUrl) throw new Error();
      urlCache.current.set(pdfId, data.signedUrl);
      setViewerUrl(data.signedUrl);
    } catch {
      toast.error("Couldn't open the document");
    }
  }, []);

  /* ---------- sessions ---------- */

  async function createChat(): Promise<string | null> {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New session" }),
      });
      if (!res.ok) throw new Error();
      const c = await res.json();
      const created: Chat = { id: c.id, title: c.title, timestamp: new Date(c.createdAt), messages: [], quizHistory: [] };
      setChats((prev) => [created, ...prev]);
      return created.id;
    } catch {
      toast.error("Couldn't start a session");
      return null;
    }
  }

  async function handleNewChat() {
    const id = await createChat();
    if (id) selectChat(id);
  }

  async function selectChat(id: string, closeMobile = true) {
    setActiveChat(id);
    setScopePdf(null);
    setView("chat");
    setViewerPdf(null);
    setViewerUrl(null);
    if (closeMobile) setIsMobileOpen(false);
    const list = await loadPdfs(id);
    if (list[0]) openInViewer(list[0].id, 1, false, isDesktop());
    else setViewerOpen(isDesktop());
  }

  /* ---------- documents ---------- */

  async function handleUpload(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }
    let chatId = activeChat;
    if (!chatId) {
      chatId = await createChat();
      if (!chatId) return;
      setActiveChat(chatId);
      setView("chat");
    }
    setUploadingName(file.name);
    const form = new FormData();
    form.append("file", file);
    form.append("chatId", chatId);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success(`${file.name} is ready`, {
        description: data.pages ? `${data.pages} pages indexed. Answers will cite these pages.` : undefined,
      });
      await loadPdfs(chatId);
      if (data.pdfId) {
        setScopePdf(null);
        openInViewer(data.pdfId, 1, false, isDesktop());
      }
    } catch (e) {
      toast.error("Upload didn't finish", { description: e instanceof Error ? e.message : undefined });
      await loadPdfs(chatId);
    } finally {
      setUploadingName(null);
    }
  }

  async function handleReindex(pdfId: string) {
    setReindexingId(pdfId);
    try {
      const res = await fetch(`/api/pdfs/${pdfId}/index`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Indexing failed");
      toast.success("Document re-indexed", { description: data.message });
      await loadPdfs(activeChat);
    } catch (e) {
      toast.error("Re-indexing failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setReindexingId(null);
    }
  }

  function handleSelectPdf(id: string | null) {
    setScopePdf(id);
    setView("chat");
    setIsMobileOpen(false);
    if (id) openInViewer(id, 1);
  }

  /* ---------- chat ---------- */

  function appendMessage(chatId: string, msg: Message) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, msg] } : c)));
  }

  async function handleAsk(question: string) {
    if (!activeChat || pdfs.length === 0) return;
    const chatId = activeChat;
    appendMessage(chatId, { id: crypto.randomUUID(), role: "user", content: question, timestamp: new Date() });
    setIsAsking(true);
    try {
      const res = await fetch("/api/chat/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfIds: scopePdf ? [scopePdf] : pdfs.map((p) => p.id), question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The tutor couldn't answer that.");
      appendMessage(chatId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer || "No answer was generated.",
        timestamp: new Date(),
        citations: (data.citations ?? []) as Citation[],
      });
    } catch (e) {
      appendMessage(chatId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `${e instanceof Error ? e.message : "Something went wrong."} Please try asking again.`,
        timestamp: new Date(),
        error: true,
      });
    } finally {
      setIsAsking(false);
    }
  }

  function handleCitation(pdfId: string, page: number) {
    openInViewer(pdfId, page, true);
  }

  /* ---------- quiz ---------- */

  function handleSaveProgress(score: number, total: number, answers: QuizAnswer[], questionTypes: QuestionTypes) {
    if (!activeChat) return;
    const result = { id: crypto.randomUUID(), timestamp: new Date(), score, total, answers, questionTypes };
    setChats((prev) => prev.map((c) => (c.id === activeChat ? { ...c, quizHistory: [...c.quizHistory, result] } : c)));
  }

  /* ---------- derived ---------- */

  const scopeLabel = useMemo(() => {
    if (pdfs.length === 0) return "No documents yet";
    if (scopePdf) return pdfs.find((p) => p.id === scopePdf)?.title ?? "Selected document";
    return pdfs.length === 1 ? pdfs[0].title : `All ${pdfs.length} documents`;
  }, [pdfs, scopePdf]);

  const viewerTitle = pdfs.find((p) => p.id === viewerPdf)?.title;
  const panelAvailable = view === "chat" && pdfs.length > 0;
  const showPanel = panelAvailable && viewerOpen && !!viewerPdf;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar
        chats={chats}
        pdfs={pdfs}
        activeChat={activeChat}
        activePDF={scopePdf}
        view={view}
        uploadingName={uploadingName}
        reindexingId={reindexingId}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
        onNewChat={handleNewChat}
        onSelectChat={(id) => selectChat(id)}
        onSelectPDF={handleSelectPdf}
        onUploadPDF={handleUpload}
        onReindex={handleReindex}
        onNavigate={(v) => {
          setView(v);
          setIsMobileOpen(false);
        }}
      />

      <main id="main" className="flex min-w-0 flex-1 flex-col">
        <header className="glass relative z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="max-lg:size-11 lg:hidden" onClick={() => setIsMobileOpen(true)} aria-label="Open sidebar">
              <Menu className="size-[18px]" />
            </Button>
            <h1 className="font-serif text-[19px] leading-none">{VIEW_TITLE[view]}</h1>
            {chat && (
              <>
                <span className="text-border" aria-hidden>
                  /
                </span>
                <span className="truncate text-[13px] text-muted-foreground">{chat.title}</span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {panelAvailable && !showPanel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (viewerPdf ? setViewerOpen(true) : openInViewer(scopePdf ?? pdfs[0].id, 1))}
                aria-label="Show document"
                className="text-muted-foreground max-lg:size-11"
              >
                <PanelRightOpen className="size-4" strokeWidth={1.75} />
                <span className="hidden sm:inline">Show document</span>
              </Button>
            )}
            <ThemeToggle />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <section className="min-w-0 flex-1" aria-label={VIEW_TITLE[view]}>
            {view === "chat" && (
              <ChatInterface
                messages={chat?.messages ?? []}
                pdfs={pdfs}
                scopeLabel={scopeLabel}
                isLoading={isAsking}
                onSendMessage={handleAsk}
                onCitationClick={handleCitation}
              />
            )}
            {view === "quiz" && (
              <QuizGenerator
                key={activeChat ?? "none"}
                chatId={activeChat}
                hasDocuments={pdfs.length > 0}
                onExit={() => setView("chat")}
                onSaveProgress={handleSaveProgress}
              />
            )}
            {view === "progress" && <ProgressDashboard quizHistory={chat?.quizHistory ?? []} onStartQuiz={() => setView("quiz")} />}
          </section>

          {/* Document panel: side-by-side on desktop, full-screen sheet on small screens */}
          {showPanel && (
            <aside
              aria-label="Document"
              className={cn(
                "fixed inset-0 z-40 animate-rise-in lg:static lg:z-auto lg:w-[46%] lg:max-w-[760px] lg:animate-none lg:border-l lg:border-border"
              )}
            >
              <PDFViewer
                fileUrl={viewerUrl}
                title={viewerTitle}
                page={viewerPage}
                jumpKey={jumpKey}
                onClose={() => setViewerOpen(false)}
              />
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
