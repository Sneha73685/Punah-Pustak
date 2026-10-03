import { cn } from "@/lib/cn";
import { CONDITION_LABELS, CONDITION_SCORE } from "@/lib/listingLabels";
import type { ListingCondition } from "@/api/types";

export interface ConditionMeterProps {
  condition: ListingCondition;
  /** `lg` is the detail page's record; `sm` is everything else. */
  size?: "sm" | "lg";
  className?: string;
}

/**
 * A copy's condition as a five-step scale: ●●●○○ Good.
 *
 * The grade is carried by the word and by filled-versus-hollow marks, both
 * in ink, so it reads without colour. The marks are `aria-hidden`; the
 * word, prefixed with a visually hidden "Condition:", is what a screen
 * reader hears.
 */
export function ConditionMeter({ condition, size = "sm", className }: ConditionMeterProps): React.JSX.Element {
  const score = CONDITION_SCORE[condition];
  const isLarge = size === "lg";
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap", isLarge ? "gap-2.5" : "gap-1.5", className)}>
      <span aria-hidden="true" className={cn("inline-flex", isLarge ? "gap-[3px]" : "gap-[2px]")}>
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className={cn(
              "rounded-full border-ink",
              isLarge ? "size-3 border-2" : "size-2 border-[1.5px]",
              index < score && "bg-ink",
            )}
          />
        ))}
      </span>
      <span className={cn(isLarge ? "text-17 font-semibold" : "text-13 font-medium sm:text-15")}>
        <span className="sr-only">Condition: </span>
        {CONDITION_LABELS[condition]}
      </span>
    </span>
  );
}
