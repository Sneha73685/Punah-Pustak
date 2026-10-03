import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle } from "lucide-react";

import { Badge } from "@/components/Badge";
import { BookCover } from "@/components/BookCover";
import { buttonClasses } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { QueryState } from "@/components/QueryState";
import { Skeleton } from "@/components/Skeleton";
import { useMyListings } from "@/hooks/useListings";
import { cn } from "@/lib/cn";
import { CONDITION_LABELS, formatPrice, STATUS_LABELS, STATUS_TONES } from "@/lib/listingLabels";
import type { ListingPublic, ListingStatus } from "@/api/types";

type StatusFilter = "all" | ListingStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: STATUS_LABELS.available },
  { value: "sold", label: STATUS_LABELS.sold },
  { value: "deleted", label: STATUS_LABELS.deleted },
];

/** Desktop column template shared by the header row and every listing row. */
const ROW_GRID = "md:grid-cols-[3rem_minmax(0,1fr)_5.5rem_6rem_7rem_8rem_6.5rem]";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * FR-025: every listing the user owns, in every status. Laid out as an
 * inventory — one row per book with the facts an owner manages by (price,
 * condition, status, when it was listed) and the actions available to it —
 * rather than the public shelf grid, which is built for browsing, not
 * managing. Status tabs (with counts) narrow the list; they are toggle
 * buttons over one list, not separate pages.
 *
 * Only non-destructive actions live here (View, and Edit while a listing is
 * still available). Mark as sold and Delete stay on the listing page, behind
 * its confirmation dialogs.
 */
export function MyListingsPage(): React.JSX.Element {
  const query = useMyListings();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const listings = query.data ?? [];
  const counts: Record<StatusFilter, number> = {
    all: listings.length,
    available: listings.filter((listing) => listing.status === "available").length,
    sold: listings.filter((listing) => listing.status === "sold").length,
    deleted: listings.filter((listing) => listing.status === "deleted").length,
  };
  const visible = filter === "all" ? listings : listings.filter((listing) => listing.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My listings"
        description="The books you've listed, and where each one stands."
        actions={
          <Link to="/listings/new" className={buttonClasses("primary")}>
            <PlusCircle aria-hidden="true" className="size-4" />
            Sell a book
          </Link>
        }
      />

      <QueryState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.length === 0}
        loadingSkeleton={<InventorySkeleton />}
        emptyState={{
          title: "You haven't listed anything yet",
          description: "List a book you've finished and it will appear here, ready to manage.",
          action: (
            <Link to="/listings/new" className={buttonClasses("primary")}>
              <PlusCircle aria-hidden="true" className="size-4" />
              Sell a book
            </Link>
          ),
        }}
      >
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1 border-b border-border">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors",
                filter === option.value
                  ? "border-moss-600 text-moss-700"
                  : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {option.label}
              <span className="text-ink-soft lining-nums tabular-nums">{counts[option.value]}</span>
            </button>
          ))}
        </div>

        <div
          aria-hidden="true"
          className={cn(
            "hidden gap-x-4 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft md:grid",
            ROW_GRID,
          )}
        >
          <span />
          <span>Book</span>
          <span>Price</span>
          <span>Condition</span>
          <span>Status</span>
          <span>Listed</span>
          <span />
        </div>

        {visible.length === 0 ? (
          <p className="py-6 text-base text-ink-muted">
            {filter === "all" ? "No listings." : `No ${STATUS_LABELS[filter].toLowerCase()} listings.`}
          </p>
        ) : (
          <ul className="-mt-3 divide-y divide-border border-y border-border md:mt-0">
            {visible.map((listing) => (
              <InventoryRow key={listing.id} listing={listing} />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

function InventoryRow({ listing }: { listing: ListingPublic }): React.JSX.Element {
  const firstImage = listing.images[0];
  const detailHref = `/listings/${listing.id}`;

  return (
    <li
      className={cn(
        "grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 gap-y-1 px-1 py-4 md:items-center md:gap-y-0 md:py-3",
        ROW_GRID,
      )}
    >
      <div className="row-span-3 w-12 md:row-span-1">
        <BookCover
          size="thumb"
          inactive={listing.status !== "available"}
          title={listing.title}
          author={listing.author}
          category={listing.category}
          image={firstImage ? { url: firstImage.url, alt: "" } : undefined}
        />
      </div>

      <div className="min-w-0">
        <h2 className="line-clamp-2 font-serif text-base font-semibold text-ink">
          <Link to={detailHref} className="underline-offset-4 hover:text-moss-700 hover:underline">
            {listing.title}
          </Link>
        </h2>
        <p className="truncate font-serif text-sm italic text-ink-muted">{listing.author}</p>
      </div>

      {/* Phones: price, condition and status share one line under the title. */}
      <div className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm md:contents">
        <span className="font-serif text-base font-semibold text-ink lining-nums tabular-nums">
          {formatPrice(listing.price)}
        </span>
        <span aria-hidden="true" className="text-ink-soft md:hidden">
          &middot;
        </span>
        <span className="text-clay-600">
          <span className="sr-only">Condition: </span>
          {CONDITION_LABELS[listing.condition]}
        </span>
        <span>
          <Badge tone={STATUS_TONES[listing.status]} dot>
            {STATUS_LABELS[listing.status]}
          </Badge>
        </span>
        <span className="text-ink-muted md:text-sm">
          <span className="md:sr-only">Listed </span>
          {formatDate(listing.created_at)}
        </span>
      </div>

      <div className="col-start-2 -ml-2 flex gap-1 md:col-start-auto md:ml-0 md:justify-end">
        <Link
          to={detailHref}
          aria-label={`View ${listing.title}`}
          className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-moss-700 underline-offset-4 hover:underline"
        >
          View
        </Link>
        {listing.status === "available" && (
          <Link
            to={`${detailHref}/edit`}
            aria-label={`Edit ${listing.title}`}
            className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-moss-700 underline-offset-4 hover:underline"
          >
            Edit
          </Link>
        )}
      </div>
    </li>
  );
}

function InventorySkeleton(): React.JSX.Element {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="flex items-center gap-4 px-1 py-3">
          <Skeleton className="aspect-[2/3] w-12 shrink-0 rounded-xs" />
          <div className="flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3.5 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
