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
      <label htmlFor={selectId} className="text-[14px] font-semibold text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger">
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
          "min-h-11 rounded-xs border bg-white px-3 py-2.5 text-base text-ink",
          "transition-colors focus-visible:border-ballpoint focus-visible:outline-2 focus-visible:outline-offset-0",
          "disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-ink-2",
          error ? "border-danger" : "border-rule-strong hover:border-ink-2",
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
