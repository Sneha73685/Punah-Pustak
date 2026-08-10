import type { ReactNode } from "react";
import { BookMarked, BookOpen, Handshake, Leaf } from "lucide-react";

const PANEL_POINTS = [
  { icon: BookOpen, text: "Thousands of second-hand books, listed by real readers." },
  { icon: Handshake, text: "Deal directly with the seller — no middleman, no markup." },
  { icon: Leaf, text: "Every sale keeps a book in circulation instead of a landfill." },
];

export interface AuthShellProps {
  children: ReactNode;
}

/**
 * Shared editorial split layout for `LoginPage`/`RegisterPage`: a brand
 * panel on `lg:` screens, the form on its own on every other width. Not
 * used by `ChangePasswordPage` — that page is a forced interstitial, not an
 * entry point, so the simpler single-card treatment fits better there.
 */
export function AuthShell({ children }: AuthShellProps): React.JSX.Element {
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-border bg-white shadow-card lg:grid-cols-2">
      <div className="hidden flex-col justify-between gap-8 bg-moss-500 p-10 text-white lg:flex">
        <span className="inline-flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/15 text-white">
            <BookMarked aria-hidden="true" className="size-5" />
          </span>
          <span className="font-serif text-lg font-semibold">Punah-Pustak</span>
        </span>
        <div className="flex flex-col gap-6">
          <h2 className="font-serif text-3xl font-semibold leading-tight">
            Give your books a second story.
          </h2>
          <ul className="flex flex-col gap-4">
            {PANEL_POINTS.map((point) => (
              <li key={point.text} className="flex items-start gap-3 text-sm text-moss-50">
                <point.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-moss-100">A peer-to-peer marketplace for second-hand books.</p>
      </div>
      <div className="flex flex-col justify-center p-6 sm:p-10">{children}</div>
    </div>
  );
}
