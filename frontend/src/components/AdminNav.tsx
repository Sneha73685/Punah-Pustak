import { NavLink } from "react-router-dom";
import { BookOpen, Users } from "lucide-react";

import { cn } from "@/lib/cn";

function tabClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "inline-flex items-center gap-1.5 border-b-2 px-1 py-2.5 text-sm font-medium transition-colors",
    isActive
      ? "border-moss-500 text-moss-700"
      : "border-transparent text-ink-muted hover:text-ink",
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
    <nav aria-label="Admin section" className="flex gap-6 border-b border-border">
      <NavLink to="/admin/users" className={tabClass}>
        <Users aria-hidden="true" className="size-4" />
        Users
      </NavLink>
      <NavLink to="/admin/listings" className={tabClass}>
        <BookOpen aria-hidden="true" className="size-4" />
        Listings
      </NavLink>
    </nav>
  );
}
