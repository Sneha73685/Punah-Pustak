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
  children,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border shadow-card",
        TONE_CLASSES[tone],
        PADDING_CLASSES[padding],
        interactive && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
