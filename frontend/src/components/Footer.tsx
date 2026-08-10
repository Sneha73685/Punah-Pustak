import { Link } from "react-router-dom";

import { Logo } from "@/components/Logo";

/** FE-011 shared component: the closing section of every page, via `Layout`.
 * Purely presentational — no data fetching, no forms. */
export function Footer(): React.JSX.Element {
  return (
    <footer className="border-t border-border bg-paper-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-sm text-sm text-ink-muted">
            A peer-to-peer marketplace for giving second-hand books a new reader.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
          <Link to="/listings" className="hover:text-ink">
            Browse books
          </Link>
          <Link to="/listings/new" className="hover:text-ink">
            Sell a book
          </Link>
          <Link to="/register" className="hover:text-ink">
            Create an account
          </Link>
        </nav>
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-xs text-ink-soft sm:px-6">
        © {new Date().getFullYear()} Punah-Pustak. Give a book another chapter.
      </div>
    </footer>
  );
}
