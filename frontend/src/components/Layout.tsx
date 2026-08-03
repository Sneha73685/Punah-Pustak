import { Link, NavLink, Outlet } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100",
    isActive && "bg-slate-100 text-slate-900",
  );
}

/**
 * FE-002's route shell: a persistent nav (conditioned on auth state) plus
 * `<Outlet />` for the current page. A11Y-006: every link/button here is a
 * real `<a>`/`<button>` element, so keyboard tab order and Enter/Space
 * activation come for free from the browser rather than needing to be
 * reimplemented.
 */
export function Layout(): React.JSX.Element {
  const { state, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:p-2 focus:shadow"
      >
        Skip to main content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3"
        >
          <Link to="/" className="text-lg font-semibold text-slate-900">
            Punah-Pustak
          </Link>
          <div className="flex flex-wrap items-center gap-1">
            <NavLink to="/listings" className={navLinkClass}>
              Browse
            </NavLink>
            {state.status === "authenticated" && (
              <>
                <NavLink to="/listings/new" className={navLinkClass}>
                  Create Listing
                </NavLink>
                <NavLink to="/my-listings" className={navLinkClass}>
                  My Listings
                </NavLink>
                <NavLink to="/profile" className={navLinkClass}>
                  Profile
                </NavLink>
                {state.user.role === "admin" && (
                  <NavLink to="/admin/users" className={navLinkClass}>
                    Admin
                  </NavLink>
                )}
                <Button variant="secondary" onClick={() => void logout()}>
                  Log out
                </Button>
              </>
            )}
            {state.status === "unauthenticated" && (
              <>
                <NavLink to="/login" className={navLinkClass}>
                  Log in
                </NavLink>
                <NavLink to="/register" className={navLinkClass}>
                  Register
                </NavLink>
              </>
            )}
          </div>
        </nav>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
