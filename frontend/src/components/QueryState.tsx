import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";

import { ApiError } from "@/api/errors";
import { EmptyState } from "@/components/EmptyState";

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export interface QueryStateProps {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyMessage?: string;
  /** Renders a richer `EmptyState` in place of `emptyMessage`'s plain text —
   * opt-in per page, since not every empty list needs an icon/CTA treatment. */
  emptyState?: { icon?: ComponentType<LucideProps>; title: string; description?: string; action?: ReactNode };
  /** Replaces the default "Loading…" text with a page-appropriate skeleton
   * (e.g. `ListingGridSkeleton`) — opt-in, so simple call sites keep the
   * plain status text. */
  loadingSkeleton?: ReactNode;
  children: ReactNode;
}

/**
 * FE-030: "every data-dependent view MUST explicitly handle loading,
 * error, and empty states — not just the happy path." This is the one
 * place that pattern is implemented, so every page using TanStack Query
 * (which is all server-state access, per FE-003) renders these three
 * states identically instead of each page re-deriving its own loading
 * spinner/error box/empty-state markup — the same "no copy-pasted markup
 * for the same visual pattern" reasoning FE-011 gives for the component
 * library, applied to this cross-cutting concern instead of a single
 * visual widget.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty = false,
  emptyMessage = "Nothing to show yet.",
  emptyState,
  loadingSkeleton,
  children,
}: QueryStateProps): React.JSX.Element {
  if (isLoading) {
    if (loadingSkeleton) {
      return (
        <div role="status" aria-label="Loading">
          {loadingSkeleton}
        </div>
      );
    }
    return (
      <p role="status" className="py-8 text-center text-sm text-ink-muted">
        Loading…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="py-8 text-center text-sm font-medium text-clay-600">
        {getErrorMessage(error)}
      </p>
    );
  }

  if (isEmpty) {
    if (emptyState) {
      return <EmptyState {...emptyState} />;
    }
    return <p className="py-8 text-center text-sm text-ink-muted">{emptyMessage}</p>;
  }

  return <>{children}</>;
}
