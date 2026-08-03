import type { ReactNode } from "react";

import { ApiError } from "@/api/errors";

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
  children,
}: QueryStateProps): React.JSX.Element {
  if (isLoading) {
    return (
      <p role="status" className="py-8 text-center text-sm text-slate-500">
        Loading…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="py-8 text-center text-sm font-medium text-red-700">
        {getErrorMessage(error)}
      </p>
    );
  }

  if (isEmpty) {
    return <p className="py-8 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return <>{children}</>;
}
