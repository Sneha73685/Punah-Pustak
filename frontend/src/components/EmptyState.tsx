import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  /** Kept for API compatibility; the Copy Record system states empty
   * results in words, so no icon is drawn. */
  icon?: ComponentType<LucideProps>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * FE-011 shared component: an empty result stated plainly under a rule,
 * with the one way forward (when there is one) beneath it.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps): React.JSX.Element {
  return (
    <div className={cn("flex flex-col items-start gap-2 border-t border-ink py-8", className)}>
      <h2 className="text-22 font-bold tracking-[-0.01em] text-ink">{title}</h2>
      {description && <p className="max-w-md text-15 text-ink-2">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
