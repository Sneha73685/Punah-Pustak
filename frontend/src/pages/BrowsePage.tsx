import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, Search } from "lucide-react";

import { BookCover } from "@/components/BookCover";
import { Input } from "@/components/Input";
import { ListingCard } from "@/components/ListingCard";
import { ListingGridSkeleton } from "@/components/Skeleton";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { QueryState } from "@/components/QueryState";
import { Select } from "@/components/Select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useBrowseListings } from "@/hooks/useListings";
import { CATEGORY_LABELS, CONDITION_LABELS, formatPrice } from "@/lib/listingLabels";
import type { ListingCategory, ListingCondition, ListingPublic } from "@/api/types";

const PAGE_SIZE = 20;

/**
 * Phase 2B: the one composition idea kept, out of three explored live
 * against this same page's real, mixed dataset. A CSS-grid `col-span` +
 * `dense`-flow "featured tile" was tried first and rejected — relying on a
 * photo's own aspect ratio to size a spanning grid cell means an unusually
 * tall or short featured photo leaves dead space beside its shorter
 * neighbors in the same row track (confirmed live, not assumed: an
 * extra-tall test photo produced a visibly empty gap next to normal-height
 * cards). A standalone strip above the regular grid sidesteps that failure
 * mode entirely — it never shares a row with a differently-sized item, so
 * there is nothing for its own aspect ratio to misalign with. Kept from
 * that same exploration: a hairline rule beneath the strip (the one piece
 * of "editorial divider" rhythm worth borrowing on its own, without
 * building the fuller shelf-banding it was one option among).
 *
 * Gated on there being enough results (5+) that a featured entry reads as
 * a considered opening rather than a lonely oversized tile on a sparse
 * filtered page — the plain, unchanged grid renders below that threshold.
 * The split is computed synchronously from data already in hand, so it
 * never causes a layout shift of its own.
 */
function FeaturedEntry({ listing }: { listing: ListingPublic }): React.JSX.Element {
  const firstImage = listing.images[0];
  return (
    <Link
      to={`/listings/${listing.id}`}
      className="group flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-start sm:gap-8"
    >
      <BookCover
        size="card"
        interactive
        className="w-40 shrink-0 sm:w-48 lg:w-56"
        image={firstImage ? { url: firstImage.url, alt: `${listing.title} by ${listing.author}` } : undefined}
      />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Featured</span>
        <h3 className="font-serif text-2xl font-semibold leading-tight text-ink transition-colors group-hover:text-moss-700 sm:text-3xl">
          {listing.title}
        </h3>
        <p className="text-base text-ink-muted">{listing.author}</p>
        <div className="mt-1 flex items-baseline gap-4">
          <span className="font-serif text-xl font-semibold text-moss-700">{formatPrice(listing.price)}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-clay-600">
            {CONDITION_LABELS[listing.condition]}
          </span>
        </div>
        <p className="text-sm text-ink-soft">
          {CATEGORY_LABELS[listing.category]} &middot; {listing.seller_display_name}
        </p>
      </div>
    </Link>
  );
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const CONDITION_OPTIONS = Object.entries(CONDITION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** FR-001..004, UC-1: public browse/search/filter, paginated. The initial
 * search term can arrive via a `?search=` query param (set by `HomePage`'s
 * hero search), and the initial category via `?category=` (set by the
 * footer's category links) — both purely a convenience read on mount, this
 * page still owns its own filter state exactly as before. */
export function BrowsePage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const initialCategory = searchParams.get("category");
  const [category, setCategory] = useState<ListingCategory | "">(
    initialCategory && initialCategory in CATEGORY_LABELS ? (initialCategory as ListingCategory) : "",
  );
  const [condition, setCondition] = useState<ListingCondition | "">("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = {
    search: debouncedSearch || undefined,
    category: category || undefined,
    condition: condition || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const query = useBrowseListings(filters);

  function resetToFirstPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Browse books"
        description="Search a growing shelf of second-hand books listed directly by their owners."
      />

      <form
        className="animate-fade-up flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 sm:p-5"
        role="search"
        aria-label="Filter listings"
        onSubmit={(event) => event.preventDefault()}
      >
        <Input
          label="Search"
          icon={Search}
          placeholder="Title or author"
          value={search}
          onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Category"
            placeholder="Any category"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(e) => resetToFirstPage(setCategory)(e.target.value as ListingCategory | "")}
          />
          <Select
            label="Condition"
            placeholder="Any condition"
            options={CONDITION_OPTIONS}
            value={condition}
            onChange={(e) => resetToFirstPage(setCondition)(e.target.value as ListingCondition | "")}
          />
          <Input
            label="Min price"
            type="number"
            min={0}
            value={minPrice}
            onChange={(e) => resetToFirstPage(setMinPrice)(e.target.value)}
          />
          <Input
            label="Max price"
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => resetToFirstPage(setMaxPrice)(e.target.value)}
          />
        </div>
      </form>

      {query.data && (
        <p className="text-sm text-ink-muted" aria-live="polite">
          {query.data.total} {query.data.total === 1 ? "book" : "books"} found
        </p>
      )}

      <QueryState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.items.length === 0}
        loadingSkeleton={<ListingGridSkeleton />}
        emptyState={{
          icon: BookOpen,
          title: "No books match your filters",
          description: "Try a broader search term or clear a filter to see more results.",
        }}
      >
        {/* No entrance animation here (Phase 3 motion pass) — this grid
            remounts on every search keystroke, filter, and page change;
            see `ListingCard`'s own doc comment. Same reasoning covers the
            featured entry above it. */}
        {query.data && query.data.items.length >= 5 ? (
          <>
            <FeaturedEntry listing={query.data.items[0]} />
            <div className="grid grid-cols-2 gap-4 pt-8 sm:grid-cols-3 lg:grid-cols-4">
              {query.data.items.slice(1).map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {query.data?.items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
        {query.data && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={query.data.total}
            onPageChange={setPage}
          />
        )}
      </QueryState>
    </div>
  );
}
