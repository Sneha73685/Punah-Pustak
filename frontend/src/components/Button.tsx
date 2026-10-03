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

/** Ballpoint for the action, an outlined rule for the alternative, danger
 * only inside a confirmation of something destructive. 2px corners, no
 * shadows, no press animation. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "border border-ballpoint bg-ballpoint text-white hover:border-ballpoint-deep hover:bg-ballpoint-deep",
  secondary: "border border-rule-strong bg-transparent text-ink hover:border-ink",
  danger: "border border-danger bg-danger text-white hover:bg-[#8e1f16]",
  ghost: "border border-transparent text-ink hover:bg-field",
};

const BASE_CLASSES =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xs px-[18px] text-15 font-semibold transition-colors duration-150";

/** The button look for an element that isn't a `<button>`, chiefly a
 * router `<Link>` that navigates. Navigation should be a link (it can be
 * opened in a new tab, and assistive tech announces it as one); this lets
 * it look like the primary or secondary action it is. */
export function buttonClasses(variant: ButtonVariant = "primary", className?: string): string {
  return cn(BASE_CLASSES, VARIANT_CLASSES[variant], className);
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
      className={cn(BASE_CLASSES, "disabled:cursor-not-allowed disabled:opacity-50", VARIANT_CLASSES[variant], className)}
      {...rest}
    >
      {isLoading && <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />}
      {children}
    </button>
  );
});
