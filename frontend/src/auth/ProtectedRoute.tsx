import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";

export interface ProtectedRouteProps {
  children: ReactNode;
  /** §6: admin is a superset of user privilege — `requireAdmin` implies
   * "must be authenticated" too, not a separate check to combine at each
   * call site. */
  requireAdmin?: boolean;
}

/**
 * Client-side route guarding is a UX nicety only — SEC-030/031's actual
 * authorization boundary is server-side (`get_current_user`/`require_admin`),
 * re-checked on every request regardless of what this component decides to
 * render. This exists so a logged-out visitor sees a login screen instead
 * of a page that will just 401 on its first data fetch.
 */
export function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps): React.JSX.Element {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <p role="status" className="py-8 text-center text-sm text-slate-500">
        Loading…
      </p>
    );
  }

  if (state.status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (state.status === "password-change-required") {
    return <Navigate to="/change-password" replace />;
  }

  if (requireAdmin && state.user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
