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
    "bg-moss-500 text-white shadow-card hover:bg-moss-600 focus-visible:bg-moss-600 active:bg-moss-700",
  secondary:
    "bg-paper text-ink border border-border-strong hover:bg-paper-muted focus-visible:bg-paper-muted",
  danger:
    "bg-clay-500 text-white shadow-card hover:bg-clay-600 focus-visible:bg-clay-600 active:bg-clay-700",
  ghost: "text-ink-muted hover:bg-paper-muted hover:text-ink focus-visible:bg-paper-muted",
};

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
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium",
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
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
