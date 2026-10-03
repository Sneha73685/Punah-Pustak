import { cn } from "@/lib/cn";

/**
 * Admin's row actions: quiet underlined text, not filled buttons, so a
 * table of thirty rows isn't a column of thirty coloured blocks. The
 * destructive colour belongs to the confirmation dialog each destructive
 * action opens, not to the trigger. A full 44px touch target on phones;
 * compact (32px) inside the dense desktop table.
 */
export function adminActionClasses(className?: string): string {
  return cn(
    "inline-flex min-h-11 items-center px-1 text-[14px] font-medium text-ballpoint underline decoration-1 underline-offset-[3px] hover:decoration-2 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-8",
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

/** A single-choice filter as a row of text toggles (`aria-pressed`) inside
 * a labelled group: every option visible at once, the current one bold and
 * underlined in ink. */
export function SegmentedFilter<T extends string>({ label, options, value, onChange }: SegmentedFilterProps<T>): React.JSX.Element {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-x-5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex min-h-11 items-center text-[14px] md:min-h-9",
            value === option.value ? "font-bold text-ink shadow-[inset_0_-2px_0_var(--color-ink)]" : "text-ink hover:underline hover:underline-offset-4",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
