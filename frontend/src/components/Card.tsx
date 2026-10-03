import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardTone = "white" | "muted";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover elevation/lift — for cards that are themselves a link/button
   * target (e.g. `ListingCard`), not for static content panels. */
  interactive?: boolean;
  /**
   * Dedicated props rather than `className="p-0"`/`"bg-paper-muted"`
   * overrides: Tailwind's generated stylesheet orders same-property
   * utilities alphabetically by class name, so a caller-supplied class
   * placed later in the `class` attribute does NOT reliably win over this
   * component's own default class for that same property — the *later
   * rule in the stylesheet* wins, not the later class in the attribute
   * string. Props sidestep that entirely.
   */
  padding?: CardPadding;
  tone?: CardTone;
  /**
   * Material hierarchy, not a style toggle: `true` (default) is for
   * content genuinely presented as a distinct, lifted object — a listing
   * card, a modal, an auth/interstitial panel, something floating above
   * the page. `false` is for a *structural* grouping that happens to
   * share this component's rounded/bordered container (a form panel, an
   * inline status message, a data table wrapper) but isn't meant to read
   * as "elevated" — it drops `shadow-card` while keeping the border, so
   * the container still reads as a defined region without competing for
   * the same visual weight as the page's genuinely floating surfaces.
   * Reach for `elevated={false}` before reaching for no `Card` at all;
   * reach for no `Card` (plain spacing/`border-t`/`divide-y`) before
   * stacking three of these side by side for content that isn't actually
   * three separate objects.
   */
  elevated?: boolean;
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-8",
};

const TONE_CLASSES: Record<CardTone, string> = {
  white: "bg-white",
  muted: "bg-paper-muted",
};

/** FE-011 shared component: the one visual "boxed content" pattern reused
 * across listing cards, form panels, and summary tiles. */
export function Card({
  className,
  interactive = false,
  padding = "md",
  tone = "white",
  elevated = true,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border",
        elevated && "shadow-card",
        TONE_CLASSES[tone],
        PADDING_CLASSES[padding],
        // Phase 3 motion pass: 300ms → 200ms. This fires on every listing
        // -card hover across the whole app — the highest-frequency
        // interactive motion in the system — so it needs to read as an
        // immediate response ("this object responds to me"), not a
        // deliberate reveal; 200ms sits in the tactile-feedback range
        // rather than the slower entrance-animation range.
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-border-strong hover:shadow-card-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
