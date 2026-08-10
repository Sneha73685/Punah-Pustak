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
}

/** FE-011 shared component. Same label/error association pattern as `Input`
 * (A11Y-003) — kept as a separate component rather than folding into
 * `Input` since a native `<select>`'s element type and children shape are
 * different enough that sharing one component would need its own internal
 * branching, which is worse than two small, single-purpose components. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, placeholder, error, id, className, required, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-clay-600">
            *
          </span>
        )}
      </label>
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "rounded-lg border bg-white px-3 py-2.5 text-sm text-ink",
          "transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500/40",
          "disabled:cursor-not-allowed disabled:bg-paper-muted disabled:text-ink-muted",
          error ? "border-clay-500" : "border-border-strong",
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
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-clay-600">
          {error}
        </p>
      )}
    </div>
  );
});
