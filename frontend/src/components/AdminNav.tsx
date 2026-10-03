import { NavLink } from "react-router-dom";

import { cn } from "@/lib/cn";

function tabClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "inline-flex min-h-11 items-center text-15",
    isActive ? "font-bold text-ink shadow-[inset_0_-3px_0_var(--color-ink)]" : "font-medium text-ink hover:underline hover:underline-offset-4",
  );
}

/**
 * The admin section's two sibling pages (SRS §23: "Admin (Users,
 * Listings)"). `Layout`'s main nav only links to `/admin/users`, so without
 * this `/admin/listings` (FR-043) would be reachable only by typing its URL.
 */
export function AdminNav(): React.JSX.Element {
  return (
    <nav aria-label="Admin section" className="flex gap-7 border-b border-ink">
      <NavLink to="/admin/users" className={tabClass}>
        Users
      </NavLink>
      <NavLink to="/admin/listings" className={tabClass}>
        Listings
      </NavLink>
    </nav>
  );
}
