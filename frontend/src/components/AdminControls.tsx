import { cn } from "@/lib/cn";

/**
 * Admin's row actions: compact text buttons rather than filled ones, so a
 * table of thirty rows isn't a column of thirty red blocks. The
 * destructive colour belongs to the confirmation dialog each destructive
 * action opens, not to the trigger. On phones (card layout) they grow to a
 * full 44px touch target; in the desktop table they stay compact (≥32px,
 * pointer use) to keep rows dense.
 */
export function adminActionClasses(className?: string): string {
  return cn(
    "inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-moss-700 transition-colors hover:bg-moss-50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-8",
    className,
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedFilterProps<T extends string> {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A single-choice filter as a row of toggle buttons (`aria-pressed`)
 * inside a labelled group — every option visible at once, one click to
 * switch, instead of a select whose options are hidden until opened. */
export function SegmentedFilter<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedFilterProps<T>): React.JSX.Element {
  return (
    <div role="group" aria-label={label} className="inline-flex w-fit flex-wrap rounded-lg border border-border-strong p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-10 rounded-md px-3 text-sm font-medium transition-colors",
            value === option.value ? "bg-ink text-paper" : "text-ink-muted hover:bg-paper-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
