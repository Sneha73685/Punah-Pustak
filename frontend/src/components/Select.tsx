import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  /** Rendered as the first, disabled-if-required `<option>` — e.g. "Any category". */
  placeholder?: string;
  error?: string;
  /** Helper text under the field, e.g. what the selected option means. */
  hint?: string;
}

/** FE-011 shared component. Same label/error association pattern as `Input`
 * (A11Y-003) — kept as a separate component rather than folding into
 * `Input` since a native `<select>`'s element type and children shape are
 * different enough that sharing one component would need its own internal
 * branching, which is worse than two small, single-purpose components. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, error, hint, id, className, required, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const hintId = `${selectId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger-600">
            *
          </span>
        )}
      </label>
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && errorId, hint && !error && hintId) || undefined}
        className={cn(
          "min-h-11 rounded-lg border bg-white px-3 py-2.5 text-base text-ink sm:text-sm",
          "transition-[box-shadow,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500/40",
          "disabled:cursor-not-allowed disabled:bg-paper-muted disabled:text-ink-muted",
          error
            ? "border-danger-600"
            : "border-border-strong hover:border-ink-soft/60 focus-visible:border-moss-500",
          className,
        )}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {children as ReactNode}
      </select>
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});
