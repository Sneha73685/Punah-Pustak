import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ComponentType<LucideProps>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * FE-011 shared component: the richer replacement for a bare "Nothing to
 * show yet." line, used wherever an empty result set is itself part of the
 * expected experience (an empty marketplace on day one, a seller with no
 * listings yet) rather than a dead end — pairs an icon, a human title/
 * description, and an optional call-to-action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-paper-muted/60 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-white text-moss-500 shadow-card">
          <Icon aria-hidden="true" className="size-6" />
        </span>
      )}
      <h3 className="font-serif text-lg font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
