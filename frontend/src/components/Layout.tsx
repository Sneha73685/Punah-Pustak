import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import { PAGE_CLASSES } from "@/lib/layout";

/** Desktop nav item. The current page's mark is a 3px ink bar that sits on
 * the header's own bottom rule, like a tab in a card index. */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "inline-flex h-full items-center text-15 font-medium text-ink",
    isActive ? "shadow-[inset_0_-3px_0_var(--color-ink)]" : "hover:underline hover:decoration-1 hover:underline-offset-[5px]",
  );
}

function mobileNavLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "flex min-h-12 items-center border-b border-rule text-17 font-medium text-ink",
    isActive && "font-bold",
  );
}

/**
 * FE-002's route shell: a persistent header (conditioned on auth state),
 * `<Outlet />` for the current page, and a footer. A11Y-006: every
 * link/button here is a real `<a>`/`<button>`, so keyboard order and
 * activation come from the browser.
 *
 * The header is the wordmark followed directly by the navigation, left
 * aligned, with the account controls at the far right, over a single ink
 * rule. 64px on desktop, 56px on phones, where the links fold into a menu.
 */
export function Layout(): React.JSX.Element {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Admin is one section with two tabs (`AdminNav`); the main nav's single
  // "Admin" entry reads as current on either, and admin pages are
  // operational screens that don't need the marketplace footer.
  const isAdminRoute = useLocation().pathname.startsWith("/admin");

  const isAuthenticated = state.status === "authenticated";
  const isAdmin = isAuthenticated && state.user.role === "admin";
  const closeMenu = (): void => setIsMenuOpen(false);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:bg-ground focus:p-2"
      >
        Skip to main content
      </a>
      <header className="border-b border-ink bg-ground">
        <nav aria-label="Main navigation" className={cn(PAGE_CLASSES, "flex h-14 items-center gap-10 md:h-16")}>
          <Link to="/" className="inline-flex min-h-11 shrink-0 items-center" onClick={closeMenu}>
            <Logo />
          </Link>

          <div className="hidden h-full flex-1 items-center gap-7 md:flex">
            <NavLink to="/listings" className={navLinkClass} end>
              Browse
            </NavLink>
            <NavLink to="/listings/new" className={navLinkClass}>
              List a copy
            </NavLink>
            {isAuthenticated && (
              <>
                <NavLink to="/my-listings" className={navLinkClass}>
                  My listings
                </NavLink>
                <NavLink to="/profile" className={navLinkClass}>
                  Profile
                </NavLink>
                {isAdmin && (
                  <NavLink to="/admin/users" className={({ isActive }) => navLinkClass({ isActive: isActive || isAdminRoute })}>
                    Admin
                  </NavLink>
                )}
              </>
            )}
          </div>

          <div className="hidden h-full items-center gap-6 md:flex">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex min-h-11 items-center text-15 font-medium text-ink hover:underline hover:underline-offset-[5px]"
              >
                Log out
              </button>
            ) : state.status === "unauthenticated" ? (
              <>
                <NavLink to="/login" className={navLinkClass}>
                  Log in
                </NavLink>
                <Button variant="secondary" onClick={() => navigate("/register")}>
                  Register
                </Button>
              </>
            ) : null}
          </div>

          <button
            type="button"
            className="ml-auto inline-flex min-h-11 items-center px-1 text-15 font-semibold text-ink md:hidden"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? "Close" : "Menu"}
          </button>
        </nav>

        {isMenuOpen && (
          <div id="mobile-nav" className={cn(PAGE_CLASSES, "animate-menu-in border-t border-ink pb-4 md:hidden")}>
            <div className="flex flex-col">
              <NavLink to="/listings" className={mobileNavLinkClass} end onClick={closeMenu}>
                Browse
              </NavLink>
              <NavLink to="/listings/new" className={mobileNavLinkClass} onClick={closeMenu}>
                List a copy
              </NavLink>
              {isAuthenticated ? (
                <>
                  <NavLink to="/my-listings" className={mobileNavLinkClass} onClick={closeMenu}>
                    My listings
                  </NavLink>
                  <NavLink to="/profile" className={mobileNavLinkClass} onClick={closeMenu}>
                    Profile
                  </NavLink>
                  {isAdmin && (
                    <NavLink
                      to="/admin/users"
                      className={({ isActive }) => mobileNavLinkClass({ isActive: isActive || isAdminRoute })}
                      onClick={closeMenu}
                    >
                      Admin
                    </NavLink>
                  )}
                  <button
                    type="button"
                    className="flex min-h-12 items-center text-left text-17 font-medium text-ink"
                    onClick={() => {
                      closeMenu();
                      void logout();
                    }}
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className={mobileNavLinkClass} onClick={closeMenu}>
                    Log in
                  </NavLink>
                  <NavLink to="/register" className={mobileNavLinkClass} onClick={closeMenu}>
                    Register
                  </NavLink>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* At least a viewport tall (less the header), so the footer always
          starts below the fold: pages that load content asynchronously can
          then grow without shoving a visible footer down the screen. */}
      <main id="main-content" className={cn(PAGE_CLASSES, "min-h-[calc(100svh-4rem)] flex-1 pb-16 sm:pb-20")}>
        <Outlet />
      </main>

      {!isAdminRoute && <Footer />}
    </div>
  );
}
