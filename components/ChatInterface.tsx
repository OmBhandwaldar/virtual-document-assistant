"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Citation, Message, PDFRecord } from "@/lib/types";

interface ChatInterfaceProps {
  messages: Message[];
  pdfs: PDFRecord[];
  scopeLabel: string;
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onCitationClick: (pdfId: string, page: number) => void;
}

const STARTERS = [
  "Summarise the main ideas, chapter by chapter",
  "Explain the most difficult concept in plain language",
  "What would an exam most likely ask about this?",
];

export default function ChatInterface({
  messages,
  pdfs,
  scopeLabel,
  isLoading,
  onSendMessage,
  onCitationClick,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasDocs = pdfs.length > 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value || isLoading) return;
    onSendMessage(value);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Conversation">
        <div className="mx-auto w-full max-w-[44rem] px-5 pb-44 pt-10 sm:px-8">
          {messages.length === 0 ? (
            <EmptyState hasDocs={hasDocs} onPick={submit} />
          ) : (
            <ol className="space-y-9">
              {messages.map((m) => (
                <li key={m.id} className="animate-rise-in">
                  {m.role === "user" ? (
                    <UserMessage message={m} />
                  ) : (
                    <AssistantMessage message={m} pdfs={pdfs} onCitationClick={onCitationClick} />
                  )}
                </li>
              ))}
              {isLoading && (
                <li aria-label="The tutor is reading your documents">
                  <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
                    <span className="flex gap-1" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="typing-dot size-1.5 rounded-full bg-foreground/60" style={{ animationDelay: `${i * 160}ms` }} />
                      ))}
                    </span>
                    Reading your documents…
                  </div>
                </li>
              )}
            </ol>
          )}
        </div>
      </div>

      {/* Composer: frosted so the conversation stays legible as it scrolls beneath */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent pt-10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="pointer-events-auto mx-auto mb-4 w-full max-w-[44rem] px-4 sm:mb-6 sm:px-8"
        >
          <div className="glass-card rounded-2xl border border-border p-2 focus-within:border-ring/70 focus-within:ring-[3px] focus-within:ring-ring/25 transition-shadow">
            <label htmlFor="composer" className="sr-only">
              Ask a question about {scopeLabel}
            </label>
            <textarea
              id="composer"
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              placeholder={hasDocs ? "Ask about your documents…" : "Upload a PDF to start asking questions"}
              disabled={!hasDocs}
              className="block max-h-[200px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between gap-3 pl-3">
              <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                <FileText className="size-3.5 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{scopeLabel}</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">Enter ↵ to send</span>
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || isLoading || !hasDocs}
                  aria-label="Send question"
                  className="size-9 rounded-xl"
                >
                  <ArrowUp className="size-4" strokeWidth={2.25} />
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ hasDocs, onPick }: { hasDocs: boolean; onPick: (q: string) => void }) {
  return (
    <div className="pt-[8vh]">
      <p className="eyebrow mb-4">{hasDocs ? "Ready" : "Getting started"}</p>
      <h1 className="font-serif text-[clamp(2rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.02em]">
        Ask your documents
        <br />
        <span className="italic text-muted-foreground">anything.</span>
      </h1>
      <p className="mt-5 max-w-[34rem] text-[15px] leading-relaxed text-muted-foreground">
        Answers are written only from your PDFs, and every claim points back to the page it came from. Click a page
        reference to open it beside the conversation.
      </p>

      {hasDocs ? (
        <div className="mt-10">
          <p className="eyebrow mb-3">Try</p>
          <ul className="divide-y divide-border border-y border-border">
            {STARTERS.map((q) => (
              <li key={q}>
                <button
                  onClick={() => onPick(q)}
                  className="group flex w-full items-center justify-between gap-4 py-3.5 text-left text-[15px] transition-colors hover:text-foreground"
                >
                  <span className="text-foreground/85 group-hover:text-foreground">{q}</span>
                  <ArrowUp className="size-4 shrink-0 rotate-45 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          {[
            ["Upload", "Add a course PDF from the sidebar."],
            ["Ask", "Get answers with page references."],
            ["Test", "Generate a quiz and track progress."],
          ].map(([t, d], i) => (
            <li key={t} className="bg-card p-4">
              <span className="font-mono text-[11px] text-muted-foreground tabular">0{i + 1}</span>
              <p className="mt-2 text-[14px] font-medium">{t}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[15px] leading-relaxed">
        {message.content}
      </p>
    </div>
  );
}

function AssistantMessage({
  message,
  pdfs,
  onCitationClick,
}: {
  message: Message;
  pdfs: PDFRecord[];
  onCitationClick: (pdfId: string, page: number) => void;
}) {
  const sources = useMemo(() => uniqueSources(message.citations ?? []), [message.citations]);

  if (message.error) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-[14px] text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <p>{message.content}</p>
      </div>
    );
  }

  const resolve = (title: string | null, page: number) => resolveCitation(title, page, pdfs, message.citations ?? []);
  const multiDoc = new Set(sources.map((s) => s.pdfId)).size > 1;

  return (
    <article>
      <div className="prose-answer">
        <RichText text={message.content} resolve={resolve} onCitationClick={onCitationClick} />
      </div>

      {sources.length > 0 && (
        <footer className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-border pt-3">
          <span className="eyebrow mr-1">Passages consulted</span>
          {sources.map((s) => (
            <PageChip
              key={`${s.pdfId}:${s.page}`}
              page={s.page}
              label={multiDoc ? shortTitle(pdfs.find((p) => p.id === s.pdfId)) : undefined}
              onClick={() => onCitationClick(s.pdfId, s.page)}
              subtle
            />
          ))}
        </footer>
      )}
    </article>
  );
}

/* ---------- inline formatting + citations ---------- */

type Resolver = (title: string | null, page: number) => string | null;

// "(NIST.CSWP.29.pdf, p.9)" or "(Doc, p. 4; Doc, p. 7)" or "(p. 12)"
const CITE_GROUP = /\(([^()]*?\bp(?:p|age)?\.?\s*\d+[^()]*)\)/gi;
const CITE_ITEM = /(?:([^;,()]+?)\s*,\s*)?p(?:p|age)?\.?\s*(\d+)/gi;

function RichText({ text, resolve, onCitationClick }: { text: string; resolve: Resolver; onCitationClick: (pdfId: string, page: number) => void }) {
  // Group lines into blocks: consecutive list items form one list; headings stand alone;
  // other consecutive lines form a paragraph (blank lines separate paragraphs).
  type Block = { kind: "p"; lines: string[] } | { kind: "list"; ordered: boolean; items: string[] } | { kind: "h"; text: string };
  const LIST = /^\s*([*\-•]|\d+[.)])\s+/;
  const blocks: Block[] = [];
  for (const raw of text.trim().split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      if (last?.kind === "p") blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      blocks.push({ kind: "h", text: h[1] });
    } else if (LIST.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const item = line.replace(LIST, "");
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
    } else if (last?.kind === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }

  return (
    <>
      {blocks.map((b, bi) => {
        if (b.kind === "list") {
          const ListTag = b.ordered ? "ol" : "ul";
          return (
            <ListTag key={bi} className={cn("my-3 space-y-2 pl-5", b.ordered ? "list-decimal" : "list-disc marker:text-muted-foreground")}>
              {b.items.map((it, li) => (
                <li key={li} className="pl-1">
                  <Inline text={it} resolve={resolve} onCitationClick={onCitationClick} />
                </li>
              ))}
            </ListTag>
          );
        }
        if (b.kind === "h") {
          return (
            <h3 key={bi} className="mt-5 mb-1 font-sans text-[15px] font-semibold">
              {b.text}
            </h3>
          );
        }
        if (b.lines.length === 0) return null;
        return (
          <p key={bi}>
            {b.lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                <Inline text={l} resolve={resolve} onCitationClick={onCitationClick} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function Inline({ text, resolve, onCitationClick }: { text: string; resolve: Resolver; onCitationClick: (pdfId: string, page: number) => void }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_GROUP)) {
    const items = [...m[1].matchAll(CITE_ITEM)].map((it) => ({ title: it[1]?.trim() || null, page: Number(it[2]) }));
    if (items.length === 0) continue;
    parts.push(<Emphasis key={`t${last}`} text={text.slice(last, m.index)} />);
    parts.push(
      <span key={`c${m.index}`} className="whitespace-nowrap">
        {items.map((it, i) => {
          const pdfId = resolve(it.title, it.page);
          return (
            <PageChip
              key={i}
              page={it.page}
              onClick={pdfId ? () => onCitationClick(pdfId, it.page) : undefined}
              className={i > 0 ? "ml-1" : "ml-0.5"}
            />
          );
        })}
      </span>
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(<Emphasis key="tail" text={text.slice(last)} />);
  return <>{parts}</>;
}

function Emphasis({ text }: { text: string }) {
  const out = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) return <strong key={i} className="font-semibold">{seg.slice(2, -2)}</strong>;
    if (seg.startsWith("`") && seg.endsWith("`"))
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {seg.slice(1, -1)}
        </code>
      );
    return seg;
  });
  return <>{out}</>;
}

function PageChip({
  page,
  label,
  onClick,
  subtle,
  className,
}: {
  page: number;
  label?: string;
  onClick?: () => void;
  subtle?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {label && <span className="max-w-[10rem] truncate font-sans">{label}</span>}
      <span>p.&nbsp;{page}</span>
    </>
  );
  const base = cn(
    "inline-flex items-center gap-1.5 rounded-md px-1.5 py-[1px] align-[0.1em] font-mono text-[11.5px] leading-[1.5] tabular transition-colors duration-150",
    subtle ? "border border-border bg-card text-muted-foreground" : "bg-highlight text-highlight-foreground",
    className
  );
  if (!onClick) return <span className={base}>{content}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open page ${page}${label ? ` of ${label}` : ""}`}
      className={cn(base, subtle ? "hover:border-ring hover:text-foreground" : "hover:bg-[var(--ring)]/35", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {content}
    </button>
  );
}

function uniqueSources(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const k = `${c.pdfId}:${c.page}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Maps a citation in the answer text ("Title, p.9") to a document id. */
function resolveCitation(title: string | null, page: number, pdfs: PDFRecord[], citations: Citation[]): string | null {
  if (title) {
    const t = title.toLowerCase();
    const byTitle = pdfs.find((p) => (p.title || p.filename).toLowerCase() === t) ?? pdfs.find((p) => (p.title || p.filename).toLowerCase().includes(t) || t.includes((p.title || p.filename).toLowerCase()));
    if (byTitle) return byTitle.id;
  }
  const retrieved = citations.find((c) => c.page === page);
  if (retrieved) return retrieved.pdfId;
  if (citations[0]) return citations[0].pdfId;
  return pdfs.length === 1 ? pdfs[0].id : null;
}

function shortTitle(pdf?: PDFRecord): string {
  const t = (pdf?.title || pdf?.filename || "Document").replace(/\.pdf$/i, "");
  return t.length > 22 ? `${t.slice(0, 20)}…` : t;
}
