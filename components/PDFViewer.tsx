"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, FileText, Minus, PanelRightClose, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

const Document = dynamic(() => import("react-pdf").then((m) => m.Document), { ssr: false });
const Page = dynamic(() => import("react-pdf").then((m) => m.Page), { ssr: false });

interface PDFViewerProps {
  fileUrl: string | null;
  title?: string;
  /** Page to show; changing `jumpKey` re-applies it even if the page number is the same. */
  page?: number;
  jumpKey?: number;
  onClose?: () => void;
}

export default function PDFViewer({ fileUrl, title, page = 1, jumpKey = 0, onClose }: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(page);
  const [pageInput, setPageInput] = useState(String(page));
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    import("react-pdf").then((mod) => {
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
    });
  }, []);

  // Fit page to the panel width.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fileUrl]);

  // External jump (e.g. a citation chip was clicked).
  useEffect(() => {
    const target = numPages ? clamp(page, 1, numPages) : page;
    setPageNumber(target);
    setPageInput(String(target));
    if (jumpKey > 0) setFlash((f) => f + 1);
    canvasRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page, jumpKey, numPages]);

  useEffect(() => {
    setNumPages(0);
    setError("");
  }, [fileUrl]);

  const go = (p: number) => {
    const target = clamp(p, 1, numPages || 1);
    setPageNumber(target);
    setPageInput(String(target));
  };

  if (!fileUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-sunken px-10 text-center">
        <div className="grid size-12 place-items-center rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]">
          <FileText className="size-5 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <p className="mt-5 font-serif text-[20px]">No page open</p>
        <p className="mt-2 max-w-[18rem] text-[13.5px] leading-relaxed text-muted-foreground">
          Select a document in the sidebar, or click a page reference in an answer to open it here.
        </p>
      </div>
    );
  }

  const pageWidth = width ? Math.max(240, (width - 48) * zoom) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col bg-sunken">
      {/* Toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border bg-background/60 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
          <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="truncate text-[13px] font-medium" title={title}>
            {title ?? "Document"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5 shadow-[var(--shadow-sm)]">
            <IconBtn label="Previous page" onClick={() => go(pageNumber - 1)} disabled={pageNumber <= 1}>
              <ChevronLeft />
            </IconBtn>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go(Number(pageInput) || 1);
              }}
              className="flex items-center gap-1 px-1 font-mono text-[12px] tabular text-muted-foreground"
            >
              <label htmlFor="pdf-page" className="sr-only">
                Page number
              </label>
              <input
                id="pdf-page"
                inputMode="numeric"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                onBlur={() => go(Number(pageInput) || pageNumber)}
                className="w-8 rounded bg-transparent text-center text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span>/ {numPages || "–"}</span>
            </form>
            <IconBtn label="Next page" onClick={() => go(pageNumber + 1)} disabled={!numPages || pageNumber >= numPages}>
              <ChevronRight />
            </IconBtn>
          </div>

          <div className="ml-1 hidden items-center rounded-lg border border-border bg-card p-0.5 shadow-[var(--shadow-sm)] sm:flex">
            <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))} disabled={zoom <= 0.6}>
              <Minus />
            </IconBtn>
            <button
              onClick={() => setZoom(1)}
              className="w-11 font-mono text-[12px] tabular text-muted-foreground hover:text-foreground"
              title="Fit width"
              aria-label="Reset zoom to fit width"
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2)))} disabled={zoom >= 2}>
              <Plus />
            </IconBtn>
          </div>

          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close document panel" className="ml-1 text-muted-foreground">
              <PanelRightClose className="size-4" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full justify-center p-6">
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);
              setError("");
            }}
            onLoadError={(e) => setError(e.message || "This PDF could not be loaded.")}
            loading={<PageSkeleton />}
            error={<p className="text-[13px] text-danger">{error || "This PDF could not be loaded."}</p>}
          >
            <div key={flash} className={cn("rounded-[3px] bg-white shadow-[var(--shadow-lg)]", flash > 0 && "animate-page-flash")}>
              <Page pageNumber={pageNumber} width={pageWidth} loading={<PageSkeleton />} renderTextLayer renderAnnotationLayer />
            </div>
          </Document>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function PageSkeleton() {
  return <div className="aspect-[1/1.3] w-[min(100%,560px)] animate-pulse rounded-[3px] bg-card shadow-[var(--shadow-md)]" />;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
