import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a text-preserving loading state instead of swapping to a spinner
   * -only view, so the button's accessible name doesn't disappear mid-action. */
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-moss-500 text-white hover:bg-moss-600 focus-visible:bg-moss-600 active:bg-moss-700",
  secondary:
    "bg-paper text-ink border border-border-strong hover:border-moss-500/50 hover:bg-paper-muted focus-visible:bg-paper-muted",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 focus-visible:bg-danger-700",
  ghost: "text-ink-muted hover:bg-paper-muted hover:text-ink focus-visible:bg-paper-muted",
};

const BASE_CLASSES =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-[color,background-color,border-color,transform] duration-150";

/** The button look for an element that isn't a `<button>` — chiefly a
 * router `<Link>` that navigates. Navigation should be a link (it can be
 * opened in a new tab, and assistive tech announces it as one); this lets
 * it look like the primary or secondary action it is. */
export function buttonClasses(variant: ButtonVariant = "primary", className?: string): string {
  return cn(BASE_CLASSES, "motion-safe:active:scale-[0.98]", VARIANT_CLASSES[variant], className);
}

/** FE-011 shared component. A11Y-002: all variants keep 4.5:1 contrast
 * against their background at normal text size. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", isLoading = false, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        BASE_CLASSES,
        "motion-safe:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {isLoading && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {children}
    </button>
  );
});
