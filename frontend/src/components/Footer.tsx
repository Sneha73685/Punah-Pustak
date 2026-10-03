import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Logo } from "@/components/Logo";

const LINK_CLASSES = "inline-flex min-h-11 items-center text-ink-muted transition-colors hover:text-moss-700 sm:min-h-0";

/**
 * A quiet sign-off rather than a second navigation hub: the name, one line
 * about what this is, and two short link columns. Categories live on the
 * homepage's category index and in Browse's filter, so they aren't
 * repeated here. Account links follow the session, so a signed-in reader
 * isn't offered "Create an account".
 */
export function Footer(): React.JSX.Element {
  const { state } = useAuth();
  const isAuthenticated = state.status === "authenticated";

  return (
    <footer className="mt-8 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:flex-row sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-xs text-sm text-ink-muted">Second-hand books, from one reader to the next.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:gap-x-16">
          <nav aria-label="Marketplace">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Marketplace</h2>
            <ul className="mt-2 flex flex-col sm:gap-2">
              <li>
                <Link to="/listings" className={LINK_CLASSES}>
                  Browse books
                </Link>
              </li>
              <li>
                <Link to="/listings/new" className={LINK_CLASSES}>
                  Sell a book
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Account</h2>
            <ul className="mt-2 flex flex-col sm:gap-2">
              {isAuthenticated ? (
                <>
                  <li>
                    <Link to="/my-listings" className={LINK_CLASSES}>
                      My listings
                    </Link>
                  </li>
                  <li>
                    <Link to="/profile" className={LINK_CLASSES}>
                      Profile
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link to="/login" className={LINK_CLASSES}>
                      Log in
                    </Link>
                  </li>
                  <li>
                    <Link to="/register" className={LINK_CLASSES}>
                      Create an account
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
      </div>
      <p className="border-t border-border px-4 py-4 text-center text-xs text-ink-soft sm:px-6">
        © {new Date().getFullYear()} Punah-Pustak
      </p>
    </footer>
  );
}
