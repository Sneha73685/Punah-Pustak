import { forwardRef, useId, type ComponentType, type InputHTMLAttributes } from "react";
import type { LucideProps } from "lucide-react";

import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Field-level error text (FE-021: mapped from the API-010 `fields`
   * envelope, or from client-side validation, FE-020). */
  error?: string;
  hint?: string;
  /** Keeps `label` as the input's programmatic accessible name (still
   * reachable via `getByLabelText`/a screen reader) but hides it visually —
   * for the rare spot (the homepage hero search) where the surrounding
   * layout already makes the field's purpose visually obvious and a second
   * visible "Search books" line would just add clutter. Off by default;
   * every existing call site is unaffected. */
  hideLabel?: boolean;
  /**
   * An optional leading icon (e.g. the hero search's `Search` glyph),
   * rendered inside the field itself with the input's own left padding
   * adjusted to match — decided in one place, inside this component's own
   * class list, rather than a caller trying to override `px-3` via
   * `className` (see `Card`'s own note on why a later caller class doesn't
   * reliably beat an earlier same-property utility in Tailwind v4's
   * alphabetically-ordered stylesheet: a fight this component's single
   * class list sidesteps by construction).
   */
  icon?: ComponentType<LucideProps>;
}

/**
 * FE-011 shared component. A11Y-003: the label is programmatically
 * associated via `htmlFor`/`id` (never placeholder-as-label), and an error
 * is linked with `aria-describedby` + announced via `role="alert"` — never
 * conveyed by color (a red border) alone.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, required, hideLabel = false, icon: Icon, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={cn("text-[14px] font-semibold text-ink", hideLabel && "sr-only")}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        )}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-2"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error && errorId, hint && !error && hintId) || undefined}
          className={cn(
            "min-h-11 w-full rounded-xs py-2.5 text-base text-ink placeholder:text-ink-2",
            Icon ? "pl-10 pr-3" : "px-3",
            "transition-colors focus-visible:border-ballpoint focus-visible:outline-2 focus-visible:outline-offset-0",
            "disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-ink-2",
            "border bg-white",
            error ? "border-danger" : "border-rule-strong hover:border-ink-2",
            className,
          )}
          {...rest}
        />
      </div>
      {hint && !error && (
        <p id={hintId} className="text-13 text-ink-2">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-13 font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
