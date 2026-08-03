import { NavLink } from "react-router-dom";

import { cn } from "@/lib/cn";

function tabClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100",
    isActive && "bg-slate-100 text-slate-900",
  );
}

/**
 * `Layout`'s main nav only links to `/admin/users` (the section's entry
 * point) — without this, `/admin/listings` (FR-043) had no link anywhere in
 * the UI at all and was only reachable by typing the URL directly, despite
 * the route existing and working. Shared by both admin pages rather than
 * duplicated since they're explicitly sibling pages under one admin section
 * (SRS §23: "Admin (Users, Listings)").
 */
export function AdminNav(): React.JSX.Element {
  return (
    <nav aria-label="Admin section" className="flex gap-1 border-b border-slate-200 pb-2">
      <NavLink to="/admin/users" className={tabClass}>
        Users
      </NavLink>
      <NavLink to="/admin/listings" className={tabClass}>
        Listings
      </NavLink>
    </nav>
  );
}
