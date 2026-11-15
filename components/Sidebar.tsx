"use client";

import { useRef, useState } from "react";
import {
  FileText,
  ListChecks,
  Loader2,
  MessageSquareText,
  Plus,
  RotateCw,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandMark from "@/components/BrandMark";
import { cn } from "@/lib/utils";
import type { Chat, PDFRecord, View } from "@/lib/types";

interface SidebarProps {
  chats: Chat[];
  pdfs: PDFRecord[];
  activeChat: string | null;
  activePDF: string | null;
  view: View;
  uploadingName: string | null;
  reindexingId: string | null;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onSelectPDF: (id: string | null) => void;
  onUploadPDF: (file: File) => void;
  onReindex: (id: string) => void;
  onNavigate: (view: View) => void;
}

const NAV: { view: View; label: string; icon: typeof MessageSquareText }[] = [
  { view: "chat", label: "Ask", icon: MessageSquareText },
  { view: "quiz", label: "Quiz", icon: ListChecks },
  { view: "progress", label: "Progress", icon: TrendingUp },
];

export default function Sidebar(props: SidebarProps) {
  const { isMobileOpen, onMobileClose } = props;
  return (
    <>
      {/* Mobile scrim: blur signals the content behind is dismissed */}
      <div
        aria-hidden="true"
        onClick={onMobileClose}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/25 backdrop-blur-[3px] transition-opacity duration-200 lg:hidden",
          isMobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <aside
        aria-label="Workspace"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-border bg-sunken",
          "transition-transform duration-300 ease-[var(--ease-out-expo)] lg:static lg:translate-x-0",
          isMobileOpen ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full"
        )}
      >
        <SidebarContent {...props} />
      </aside>
    </>
  );
}

function SidebarContent({
  chats,
  pdfs,
  activeChat,
  activePDF,
  view,
  uploadingName,
  reindexingId,
  onMobileClose,
  onNewChat,
  onSelectChat,
  onSelectPDF,
  onUploadPDF,
  onReindex,
  onNavigate,
}: SidebarProps) {
  return (
    <>
      {/* Brand */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-7" />
          <span className="font-serif text-[19px] leading-none tracking-[-0.01em]">
            Learning <em className="text-muted-foreground">Assistant</em>
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMobileClose} aria-label="Close sidebar">
          <X className="size-4" />
        </Button>
      </div>

      <div className="px-4">
        <Button onClick={onNewChat} className="h-10 w-full justify-start gap-2.5 px-3.5">
          <Plus className="size-4" strokeWidth={2} />
          New session
        </Button>
      </div>

      {/* Primary navigation */}
      <nav aria-label="Views" className="mt-4 px-3">
        <ul className="space-y-0.5">
          {NAV.map(({ view: v, label, icon: Icon }) => {
            const active = view === v;
            return (
              <li key={v}>
                <button
                  onClick={() => onNavigate(v)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors duration-150",
                    active ? "bg-card text-foreground shadow-[var(--shadow-sm)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[var(--ring)]" aria-hidden />}
                  <Icon className="size-4" strokeWidth={1.75} />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-6 px-3 pb-6">
          <DocumentsSection
            pdfs={pdfs}
            activePDF={activePDF}
            hasSession={!!activeChat}
            uploadingName={uploadingName}
            reindexingId={reindexingId}
            onSelectPDF={onSelectPDF}
            onUploadPDF={onUploadPDF}
            onReindex={onReindex}
          />
          <SessionsSection chats={chats} activeChat={activeChat} onSelectChat={onSelectChat} />
        </div>
      </div>
    </>
  );
}

function SectionHeading({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-2">
      <h2 className="eyebrow">{children}</h2>
      {count !== undefined && count > 0 && <span className="font-mono text-[11px] text-muted-foreground tabular">{count}</span>}
    </div>
  );
}

function DocumentsSection({
  pdfs,
  activePDF,
  hasSession,
  uploadingName,
  reindexingId,
  onSelectPDF,
  onUploadPDF,
  onReindex,
}: {
  pdfs: PDFRecord[];
  activePDF: string | null;
  hasSession: boolean;
  uploadingName: string | null;
  reindexingId: string | null;
  onSelectPDF: (id: string | null) => void;
  onUploadPDF: (file: File) => void;
  onReindex: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onUploadPDF(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section aria-labelledby="docs-heading">
      <SectionHeading count={pdfs.length}>
        <span id="docs-heading">Documents</span>
      </SectionHeading>

      <label
        htmlFor="pdf-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group flex items-center gap-3 rounded-xl border border-dashed px-3 py-3 transition-colors duration-150",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40",
          dragOver ? "border-ring bg-highlight" : "border-input hover:border-foreground/30 hover:bg-card",
          uploadingName && "pointer-events-none opacity-60"
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground group-hover:text-foreground">
          <Upload className="size-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">Add a PDF</span>
          <span className="block text-[12px] text-muted-foreground">
            {hasSession ? "Drop here or browse" : "Starts a new session"}
          </span>
        </span>
        <input
          ref={inputRef}
          id="pdf-upload"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      <ul className="mt-2 space-y-0.5">
        {uploadingName && (
          <li className="flex items-center gap-3 rounded-lg px-2.5 py-2" aria-live="polite">
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{uploadingName}</span>
              <span className="block text-[12px] text-muted-foreground">Reading pages and indexing…</span>
            </span>
          </li>
        )}
        {pdfs.length > 1 && (
          <li>
            <DocRow
              active={activePDF === null}
              onClick={() => onSelectPDF(null)}
              title="All documents"
              meta={`${pdfs.length} files · answers draw on all`}
            />
          </li>
        )}
        {pdfs.map((pdf) => {
          const indexed = !!pdf.indexedAt;
          const busy = reindexingId === pdf.id;
          return (
            <li key={pdf.id} className="group/doc relative">
              <DocRow
                active={activePDF === pdf.id}
                onClick={() => onSelectPDF(pdf.id)}
                title={pdf.title || pdf.filename}
                meta={
                  busy
                    ? "Re-indexing…"
                    : [pdf.pages ? `${pdf.pages} pp` : null, indexed ? "Indexed" : "Not indexed"].filter(Boolean).join(" · ")
                }
                warn={!indexed && !busy}
              />
              <button
                onClick={() => onReindex(pdf.id)}
                disabled={busy}
                aria-label={`Re-index ${pdf.title || pdf.filename}`}
                title="Re-index"
                className={cn(
                  "absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100",
                  !indexed || busy ? "opacity-100" : "opacity-0 group-hover/doc:opacity-100"
                )}
              >
                <RotateCw className={cn("size-3.5", busy && "animate-spin")} />
              </button>
            </li>
          );
        })}
        {pdfs.length === 0 && !uploadingName && (
          <li className="px-2.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {hasSession ? "No documents in this session yet." : "Upload a PDF to begin. Answers cite the exact page they come from."}
          </li>
        )}
      </ul>
    </section>
  );
}

function DocRow({
  active,
  onClick,
  title,
  meta,
  warn,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  meta: string;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg py-2 pl-2.5 pr-9 text-left transition-colors duration-150",
        active ? "bg-card shadow-[var(--shadow-sm)]" : "hover:bg-accent"
      )}
    >
      <FileText className={cn("size-4 shrink-0", active ? "text-[var(--highlight-foreground)]" : "text-muted-foreground")} strokeWidth={1.75} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className={cn("block truncate font-mono text-[11px] tabular", warn ? "text-[var(--highlight-foreground)]" : "text-muted-foreground")}>
          {meta}
        </span>
      </span>
    </button>
  );
}

function SessionsSection({
  chats,
  activeChat,
  onSelectChat,
}: {
  chats: Chat[];
  activeChat: string | null;
  onSelectChat: (id: string) => void;
}) {
  return (
    <section aria-labelledby="sessions-heading">
      <SectionHeading count={chats.length}>
        <span id="sessions-heading">Sessions</span>
      </SectionHeading>
      {chats.length === 0 ? (
        <p className="px-2.5 text-[12.5px] text-muted-foreground">No sessions yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {chats.map((chat) => {
            const active = activeChat === chat.id;
            return (
              <li key={chat.id}>
                <button
                  onClick={() => onSelectChat(chat.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150",
                    active ? "bg-card shadow-[var(--shadow-sm)]" : "hover:bg-accent"
                  )}
                >
                  <span className={cn("truncate text-[13px]", active ? "font-medium text-foreground" : "text-foreground/85")}>
                    {chat.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular">{relativeDate(chat.timestamp)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function relativeDate(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1d";
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
