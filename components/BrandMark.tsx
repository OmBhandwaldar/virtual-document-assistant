import { cn } from "@/lib/utils";

/** Monogram: an open folio with an ochre bookmark ribbon. */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect x="1" y="1" width="30" height="30" rx="9" className="fill-primary" />
      <path
        d="M9 10.5c2.6-.9 5-.6 7 1v11c-2-1.6-4.4-1.9-7-1zM23 10.5c-2.6-.9-5-.6-7 1v11c2-1.6 4.4-1.9 7-1z"
        className="fill-none stroke-primary-foreground"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M19.5 10.2v6.3l1.4-1.1 1.4 1.1v-6.6" className="fill-[var(--ring)]" />
    </svg>
  );
}
