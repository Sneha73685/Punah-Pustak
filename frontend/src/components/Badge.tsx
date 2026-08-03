import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
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
  className,
  children,
  ...rest
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
