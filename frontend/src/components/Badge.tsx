import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Adds a leading mark whose *shape* carries the state: a filled disc
   * (available/active), a hollow ring (sold, neutral), a cross (removed,
   * suspended). Layered on top of the label, never instead of it
   * (A11Y-003): the mark is `aria-hidden`, the text is what is read. */
  dot?: boolean;
}

const MARK_CLASSES: Record<BadgeTone, string> = {
  success: "size-[9px] rounded-full bg-ink",
  neutral: "size-[9px] rounded-full border-[1.5px] border-ink",
  danger: "size-[10px] [background:linear-gradient(45deg,transparent_42%,currentColor_42%_58%,transparent_58%),linear-gradient(-45deg,transparent_42%,currentColor_42%_58%,transparent_58%)]",
};

/**
 * FE-011 shared component: a status written as a label, not a pill. No
 * background, no rounded container; the tone changes only the mark's shape
 * and, for `danger`, the ink. Callers map their own domain value to a
 * tone (e.g. `sold` -> "neutral", `suspended` -> "danger").
 */
export function Badge({ tone = "neutral", dot = false, className, children, ...rest }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[14px] font-semibold",
        tone === "danger" ? "text-danger" : "text-ink",
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden="true" className={cn("shrink-0", MARK_CLASSES[tone])} />}
      {children}
    </span>
  );
}
