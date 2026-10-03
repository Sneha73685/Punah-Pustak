import { useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/Badge";
import { buttonClasses } from "@/components/Button";
import { ConditionMeter } from "@/components/ConditionMeter";
import { PageHeader } from "@/components/PageHeader";
import { PhotoFrame } from "@/components/PhotoFrame";
import { QueryState } from "@/components/QueryState";
import { Skeleton } from "@/components/Skeleton";
import { useMyListings } from "@/hooks/useListings";
import { cn } from "@/lib/cn";
import { formatDay, formatPrice, STATUS_LABELS, STATUS_TONES } from "@/lib/listingLabels";
import type { ListingPublic, ListingStatus } from "@/api/types";

type StatusFilter = "all" | ListingStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: STATUS_LABELS.available },
  { value: "sold", label: STATUS_LABELS.sold },
  { value: "deleted", label: STATUS_LABELS.deleted },
];

/** Desktop column template shared by the header row and every ledger row:
 * photo, copy, price, condition, status, date, actions. */
const ROW_GRID = "lg:grid-cols-[56px_minmax(0,1fr)_5.5rem_8.5rem_7rem_9.5rem_6rem]";

const ACTION_CLASSES =
  "inline-flex min-h-11 items-center px-1 text-15 font-medium text-ballpoint underline decoration-1 underline-offset-[3px] hover:decoration-2";

/**
 * FR-025: every listing the user owns, in every status, as a seller's
 * ledger: one ruled row per copy with the facts an owner manages by
 * (price, condition, status, date) and the actions open to it. Status tabs
 * with counts narrow the ledger; they are toggle buttons over one list,
 * not separate pages. On phones each row stacks into a short record.
 *
 * Only non-destructive actions live here (View, and Edit while a copy is
 * still available). Mark as sold and Delete stay on the listing page,
 * behind its confirmation dialogs.
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
  const listACopy = (
    <Link to="/listings/new" className={buttonClasses("primary")}>
      List a copy
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My listings" description="Every copy you've listed, and where each one stands." actions={listACopy} />

      <QueryState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.length === 0}
        loadingSkeleton={<LedgerSkeleton />}
        emptyState={{
          title: "You haven't listed anything yet",
          description: "Photograph a book you've finished, describe its wear, set a price, and it will appear here.",
          action: listACopy,
        }}
      >
        <div>
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-x-6 border-b border-ink">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  "inline-flex min-h-11 items-baseline gap-1.5 pt-2.5 text-15 text-ink",
                  filter === option.value ? "font-bold shadow-[inset_0_-3px_0_var(--color-ink)]" : "hover:underline hover:underline-offset-4",
                )}
              >
                {option.label}
                <span className="tnum font-mono text-13 font-normal text-ink-2">{counts[option.value]}</span>
              </button>
            ))}
          </div>

          <div aria-hidden="true" className={cn("hidden gap-x-4 border-b border-ink py-2.5 text-13 font-bold text-ink lg:grid", ROW_GRID)}>
            <span />
            <span>Copy</span>
            <span className="text-right">Price</span>
            <span>Condition</span>
            <span>Status</span>
            <span>Date</span>
            <span />
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-15 text-ink-2">
              {filter === "all" ? "No listings." : `No ${STATUS_LABELS[filter].toLowerCase()} listings.`}
            </p>
          ) : (
            <ul>
              {visible.map((listing) => (
                <LedgerRow key={listing.id} listing={listing} />
              ))}
            </ul>
          )}
        </div>
      </QueryState>
    </div>
  );
}

function LedgerRow({ listing }: { listing: ListingPublic }): React.JSX.Element {
  const firstImage = listing.images[0];
  const detailHref = `/listings/${listing.id}`;
  const isInactive = listing.status !== "available";
  const date =
    listing.status === "sold" && listing.sold_at ? `Sold ${formatDay(listing.sold_at)}` : `Listed ${formatDay(listing.created_at)}`;

  return (
    <li
      className={cn(
        "grid grid-cols-[64px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-rule py-3 lg:items-center lg:gap-x-4 lg:gap-y-0 lg:py-2.5",
        ROW_GRID,
      )}
    >
      <div className="row-span-4 w-16 lg:row-span-1 lg:w-14">
        <PhotoFrame
          variant="thumb"
          inactive={isInactive}
          title={listing.title}
          author={listing.author}
          image={firstImage ? { url: firstImage.url, alt: "" } : undefined}
        />
      </div>

      <div className="min-w-0">
        <h2 className={cn("line-clamp-2 text-15 font-semibold [overflow-wrap:anywhere]", isInactive ? "text-ink-2" : "text-ink")}>
          <Link to={detailHref} className="underline-offset-[3px] hover:underline">
            {listing.title}
          </Link>
        </h2>
        <p className="truncate text-13 text-ink-2 sm:text-[14px]">{listing.author}</p>
      </div>

      <span className={cn("tnum text-right text-15 font-bold", isInactive ? "text-ink-2" : "text-ink")}>
        {formatPrice(listing.price)}
      </span>

      {/* Phones: condition and status share one line under the title. */}
      <div className="col-start-2 col-end-4 flex flex-wrap items-center gap-x-4 gap-y-1 lg:contents">
        <span>
          <ConditionMeter condition={listing.condition} />
        </span>
        <span>
          <Badge tone={STATUS_TONES[listing.status]} dot>
            {STATUS_LABELS[listing.status]}
          </Badge>
        </span>
      </div>
      <span className="tnum col-start-2 col-end-4 font-mono text-13 text-ink-2 lg:col-auto">{date}</span>

      <div className="col-start-2 col-end-4 -ml-1 flex gap-3 lg:col-auto lg:ml-0 lg:justify-end">
        <Link to={detailHref} aria-label={`View ${listing.title}`} className={ACTION_CLASSES}>
          View
        </Link>
        {listing.status === "available" && (
          <Link to={`${detailHref}/edit`} aria-label={`Edit ${listing.title}`} className={ACTION_CLASSES}>
            Edit
          </Link>
        )}
      </div>
    </li>
  );
}

function LedgerSkeleton(): React.JSX.Element {
  return (
    <ul className="border-t border-ink">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="flex items-center gap-4 border-b border-rule py-3">
          <Skeleton className="size-14 shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3.5 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
