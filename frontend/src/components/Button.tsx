import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a text-preserving loading state instead of swapping to a spinner
   * -only view, so the button's accessible name doesn't disappear mid-action. */
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-blue-700 text-white hover:bg-blue-800 focus-visible:bg-blue-800",
  secondary:
    "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 focus-visible:bg-slate-50",
  danger: "bg-red-700 text-white hover:bg-red-800 focus-visible:bg-red-800",
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
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
