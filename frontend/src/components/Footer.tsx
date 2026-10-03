import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";
import { PAGE_CLASSES } from "@/lib/layout";

const LINK_CLASSES = "inline-flex min-h-11 items-center text-[14px] text-ink hover:underline hover:underline-offset-4 sm:min-h-0";

/**
 * A single ruled line rather than a second navigation hub: the wordmark,
 * what the name means and the one fact a buyer must know (the exchange
 * happens off-site), then a handful of links. Account links follow the
 * session, so a signed-in reader isn't offered "Register".
 */
export function Footer(): React.JSX.Element {
  const { state } = useAuth();
  const isAuthenticated = state.status === "authenticated";

  return (
    <footer className="border-t border-ink">
      <div className={cn(PAGE_CLASSES, "flex flex-col gap-3 py-6 md:flex-row md:items-baseline md:gap-10")}>
        <Logo />
        <p className="flex-1 text-[14px] text-ink-2">
          <span lang="sa-Latn">punah</span>, again; <span lang="sa-Latn">pustak</span>, book. Exchange happens between
          you and the seller, off-site.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6">
          <Link to="/listings" className={LINK_CLASSES}>
            Browse
          </Link>
          <Link to="/listings/new" className={LINK_CLASSES}>
            List a copy
          </Link>
          {isAuthenticated ? (
            <Link to="/my-listings" className={LINK_CLASSES}>
              My listings
            </Link>
          ) : (
            <Link to="/login" className={LINK_CLASSES}>
              Log in
            </Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
