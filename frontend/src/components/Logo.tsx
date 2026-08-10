import { BookMarked } from "lucide-react";

import { cn } from "@/lib/cn";

export interface LogoProps {
  className?: string;
  /** Drops the wordmark, keeping only the mark — for tight spaces. */
  markOnly?: boolean;
}

/** Punah-Pustak's brand mark: "re-book" — a book icon paired with a serif
 * wordmark, reused in the navbar, footer, and the auth pages' editorial
 * panel rather than three separate hand-rolled headings. */
export function Logo({ className, markOnly = false }: LogoProps): React.JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-moss-500 text-white">
        <BookMarked aria-hidden="true" className="size-5" />
      </span>
      {!markOnly && (
        <span className="font-serif text-lg font-semibold tracking-tight text-ink">
          Punah-Pustak
        </span>
      )}
    </span>
  );
}
