import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "relative rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-paper-muted hover:text-ink",
    "after:absolute after:inset-x-3 after:-bottom-[14px] after:h-0.5 after:rounded-full after:bg-moss-500 after:transition-transform after:duration-200",
    isActive ? "text-moss-700 after:scale-x-100" : "after:scale-x-0",
  );
}

function mobileNavLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "rounded-lg px-3 py-2.5 text-base font-medium text-ink-muted hover:bg-paper-muted hover:text-ink",
    isActive && "bg-moss-50 text-moss-700",
  );
}

/**
 * FE-002's route shell: a persistent nav (conditioned on auth state) plus
 * `<Outlet />` for the current page, and a footer. A11Y-006: every link/
 * button here is a real `<a>`/`<button>` element, so keyboard tab order and
 * Enter/Space activation come for free from the browser rather than needing
 * to be reimplemented.
 */
export function Layout(): React.JSX.Element {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Admin is one section with two tabs (`AdminNav`); the main nav's single
  // "Admin" entry should read as current on either of them, and admin
  // pages are operational screens that don't need the marketplace footer.
  const isAdminRoute = useLocation().pathname.startsWith("/admin");

  const isAdmin = state.status === "authenticated" && state.user.role === "admin";

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-white focus:p-2 focus:shadow"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-paper">
        <nav
          aria-label="Main navigation"
          // Fixed height and a three-column grid (logo | links | account):
          // the account controls only render once the session has been
          // restored, and with a flex row that arrival changed the header's
          // height and re-centred the middle links — a layout shift on
          // every page load. Here neither can move.
          className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]"
        >
          <Link to="/" className="w-fit shrink-0" onClick={() => setIsMenuOpen(false)}>
            <Logo />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            <NavLink to="/listings" className={navLinkClass} end>
              Browse
            </NavLink>
            {state.status === "authenticated" && (
              <>
                <NavLink to="/listings/new" className={navLinkClass}>
                  Sell a Book
                </NavLink>
                <NavLink to="/my-listings" className={navLinkClass}>
                  My Listings
                </NavLink>
                <NavLink to="/profile" className={navLinkClass}>
                  Profile
                </NavLink>
                {isAdmin && (
                  <NavLink
                    to="/admin/users"
                    className={({ isActive }) => navLinkClass({ isActive: isActive || isAdminRoute })}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck aria-hidden="true" className="size-4" />
                      Admin
                    </span>
                  </NavLink>
                )}
              </>
            )}
          </div>

          <div className="hidden items-center justify-end gap-2 md:flex">
            {state.status === "authenticated" ? (
              <Button variant="secondary" onClick={() => void logout()}>
                <LogOut aria-hidden="true" className="size-4" />
                Log out
              </Button>
            ) : state.status === "unauthenticated" ? (
              <>
                <NavLink to="/login" className={navLinkClass}>
                  Log in
                </NavLink>
                <Button variant="primary" onClick={() => navigate("/register")}>
                  Register
                </Button>
              </>
            ) : null}
          </div>

          <button
            type="button"
            className="inline-flex size-11 items-center justify-center justify-self-end rounded-lg text-ink transition-colors hover:bg-paper-muted md:hidden"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
          </button>
        </nav>

        {isMenuOpen && (
          <div id="mobile-nav" className="animate-menu-in border-t border-border bg-paper px-4 pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-2">
              <NavLink to="/listings" className={mobileNavLinkClass} end onClick={() => setIsMenuOpen(false)}>
                Browse
              </NavLink>
              {state.status === "authenticated" ? (
                <>
                  <NavLink to="/listings/new" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>
                    Sell a Book
                  </NavLink>
                  <NavLink to="/my-listings" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>
                    My Listings
                  </NavLink>
                  <NavLink to="/profile" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>
                    Profile
                  </NavLink>
                  {isAdmin && (
                    <NavLink
                      to="/admin/users"
                      className={({ isActive }) => mobileNavLinkClass({ isActive: isActive || isAdminRoute })}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Admin
                    </NavLink>
                  )}
                  <Button
                    variant="secondary"
                    className="mt-2 justify-start"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void logout();
                    }}
                  >
                    <LogOut aria-hidden="true" className="size-4" />
                    Log out
                  </Button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>
                    Log in
                  </NavLink>
                  <NavLink to="/register" className={mobileNavLinkClass} onClick={() => setIsMenuOpen(false)}>
                    Register
                  </NavLink>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* At least a viewport tall (less the 4rem header), so the footer always
          starts below the fold: pages that load content asynchronously can
          then grow without shoving a visible footer down the screen. */}
      <main id="main-content" className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      {!isAdminRoute && <Footer />}
    </div>
  );
}
