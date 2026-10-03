import type { ReactNode } from "react";
import { BookOpen, Handshake, Leaf } from "lucide-react";

import { Logo } from "@/components/Logo";

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
 *
 * Phase 5: the form side now sits on `bg-paper` rather than stark white —
 * the same paper the rest of the product's page background already is —
 * so the panel's own white `Input` fields read as slips of paper set down
 * on the page, not a generic app card. The moss panel used to simply
 * vanish below `lg` (`hidden lg:flex`), leaving mobile with no brand
 * presence at all before Phase 5; a compact strip reusing the shared
 * `Logo` and the site's own tagline now stands in for it there, so mobile
 * gets its own small entrance instead of the desktop layout's leftover
 * half. The desktop panel's hand-rolled icon+wordmark is replaced with
 * that same shared `Logo`, rather than a second, drifting copy of it.
 */
export function AuthShell({ children }: AuthShellProps): React.JSX.Element {
  return (
    <div className="mx-auto grid max-w-4xl animate-fade-up grid-cols-1 overflow-hidden rounded-2xl border border-border bg-paper shadow-lift lg:grid-cols-2">
      <div className="flex items-center gap-2.5 border-b border-border bg-moss-600 px-6 py-4 text-white lg:hidden">
        <Logo markOnly />
        <span className="font-serif text-sm">Give your books a second story.</span>
      </div>

      <div className="relative hidden flex-col justify-between gap-8 overflow-hidden bg-moss-600 p-10 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(255,255,255,0.12),transparent_55%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-16 size-64 rounded-full bg-moss-500/40 blur-3xl"
        />
        <Logo className="relative [&_span:last-child]:text-white" />
        <div className="relative flex flex-col gap-6">
          <h2 className="font-serif text-3xl font-semibold leading-tight">
            Give your books a second story.
          </h2>
          <ul className="flex flex-col gap-4">
            {PANEL_POINTS.map((point) => (
              <li key={point.text} className="flex items-start gap-3 text-sm text-moss-50">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <point.icon aria-hidden="true" className="size-4" />
                </span>
                <span className="pt-1.5">{point.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-moss-100">
          A peer-to-peer marketplace for second-hand books.
        </p>
      </div>
      <div className="flex flex-col justify-center p-6 sm:p-10">{children}</div>
    </div>
  );
}
