import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Adds a small leading status dot in the tone's color — an additional,
   * non-text signal for status badges (e.g. available/sold/removed) layered
   * on top of the label, never instead of it (A11Y-003 still holds: the
   * dot is `aria-hidden`, the visible text remains the only thing that
   * actually has to be read to understand the status). */
  dot?: boolean;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-paper-muted text-ink-muted",
  success: "bg-moss-50 text-moss-700",
  warning: "bg-gold-50 text-gold-600",
  danger: "bg-clay-50 text-clay-600",
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-ink-soft",
  success: "bg-moss-500",
  warning: "bg-gold-500",
  danger: "bg-clay-500",
};

/**
 * FE-011 shared component — a generic status pill. Deliberately has no
 * knowledge of *what* it's labeling (a listing's `status`, a user's
 * `is_active`, etc.) — callers map their own domain value to a `tone`
 * (e.g. `available` -> "success", `suspended` -> "danger") so this stays a
 * reusable primitive rather than a listing- or user-specific component.
 * A11Y-003: color is never the only signal — the tone's background
 * changes, but the visible text label is what actually conveys meaning.
 */
export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASSES[tone])} />}
      {children}
    </span>
  );
}
