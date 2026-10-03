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
    <div className={cn("flex flex-col items-start gap-2 border-y border-border py-10", className)}>
      {Icon && <Icon aria-hidden="true" className="mb-1 size-6 text-ink-soft" />}
      <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
      {description && <p className="max-w-md text-base leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
