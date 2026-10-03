import { Link } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { CATEGORY_LABELS } from "@/lib/listingLabels";
import type { ListingCategory } from "@/api/types";

const FEATURED_CATEGORIES: ListingCategory[] = ["fiction", "non_fiction", "academic_textbook", "children"];

function footerLinkClass(): string {
  return "text-ink-muted transition-colors hover:text-moss-700";
}

/** FE-011 shared component: the closing section of every page, via `Layout`.
 * Purely presentational — no data fetching, no forms. Every link routes
 * somewhere real (browse, category filters, sell, account) rather than
 * padding the column count with placeholders that go nowhere. */
export function Footer(): React.JSX.Element {
  return (
    <footer className="border-t border-border bg-paper-muted">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 sm:grid-cols-4 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-4 lg:col-span-1">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">
            A peer-to-peer marketplace for giving second-hand books a new reader — buy and sell
            directly, no middleman.
          </p>
        </div>

        <nav aria-label="Categories" className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Categories</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {FEATURED_CATEGORIES.map((category) => (
              <li key={category}>
                <Link to={`/listings?category=${category}`} className={footerLinkClass()}>
                  {CATEGORY_LABELS[category]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Marketplace" className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Marketplace</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to="/listings" className={footerLinkClass()}>
                Browse books
              </Link>
            </li>
            <li>
              <Link to="/listings/new" className={footerLinkClass()}>
                Sell a book
              </Link>
            </li>
            <li>
              <Link to="/my-listings" className={footerLinkClass()}>
                My listings
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Account" className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Account</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <Link to="/register" className={footerLinkClass()}>
                Create an account
              </Link>
            </li>
            <li>
              <Link to="/login" className={footerLinkClass()}>
                Log in
              </Link>
            </li>
            <li>
              <Link to="/profile" className={footerLinkClass()}>
                Profile
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border px-4 py-5 text-center text-xs text-ink-soft sm:px-6">
        © {new Date().getFullYear()} Punah-Pustak. Give a book another chapter.
      </div>
    </footer>
  );
}
