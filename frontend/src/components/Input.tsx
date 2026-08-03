import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Field-level error text (FE-021: mapped from the API-010 `fields`
   * envelope, or from client-side validation, FE-020). */
  error?: string;
  hint?: string;
}

/**
 * FE-011 shared component. A11Y-003: the label is programmatically
 * associated via `htmlFor`/`id` (never placeholder-as-label), and an error
 * is linked with `aria-describedby` + announced via `role="alert"` — never
 * conveyed by color (a red border) alone.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, required, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-800">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-red-700">
            *
          </span>
        )}
      </label>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && errorId, hint && hintId) || undefined}
        className={cn(
          "rounded-md border px-3 py-2 text-sm text-slate-900",
          "focus-visible:outline-none",
          error ? "border-red-600" : "border-slate-300",
          className,
        )}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
});
