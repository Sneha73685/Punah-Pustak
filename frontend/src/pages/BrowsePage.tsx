import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { ListingCard } from "@/components/ListingCard";
import { Modal } from "@/components/Modal";
import { Pagination } from "@/components/Pagination";
import { QueryState } from "@/components/QueryState";
import { Select } from "@/components/Select";
import { ListingGridSkeleton } from "@/components/Skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useBrowseListings } from "@/hooks/useListings";
import { cn } from "@/lib/cn";
import { LISTING_GRID_CLASSES } from "@/lib/layout";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/listingLabels";
import type { ListingCategory, ListingCondition } from "@/api/types";

const PAGE_SIZE = 20;

/** At or below this many results for a narrowed search, suggest widening it. */
const FEW_RESULTS = 3;

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const CONDITION_OPTIONS = Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }));
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ListingCategory[];

function categoryFromParams(params: URLSearchParams): ListingCategory | "" {
  const value = params.get("category");
  return value && value in CATEGORY_LABELS ? (value as ListingCategory) : "";
}

interface ActiveFilter {
  key: string;
  label: string;
  clear: () => void;
}

/**
 * FR-001..004: search plus category/condition/price filtering over public,
 * available listings.
 *
 * Controls sit directly on the page under a rule rather than in a boxed
 * panel. From `sm` up the four filters are one inline row; on phones only
 * the search field and a "Filters (n)" button are inline, and the filters
 * open in a bottom sheet — so books start on the first screen instead of
 * below five stacked fields. Both layouts render the same `FilterFields`
 * bound to the same state, so they can never disagree.
 *
 * There is no "featured" listing: nothing in the data supports calling any
 * one listing featured, so every result gets the same card in the same
 * grid.
 */
export function BrowsePage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [category, setCategory] = useState<ListingCategory | "">(categoryFromParams(searchParams));
  const [condition, setCondition] = useState<ListingCondition | "">("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // The URL only seeds this page's state (filter changes don't write back to
  // it). But a link to `/listings?category=…` followed while this page is
  // already mounted — the footer's category links — changes the URL without
  // remounting, so re-seed from it when it changes.
  const paramsKey = searchParams.toString();
  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
    setCategory(categoryFromParams(searchParams));
    setCondition("");
    setMinPrice("");
    setMaxPrice("");
    setPage(1);
  }, [paramsKey]); // keyed on the serialized params, not the object

  const debouncedSearch = useDebouncedValue(search, 300);
  const query = useBrowseListings({
    search: debouncedSearch || undefined,
    category: category || undefined,
    condition: condition || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  function resetToFirstPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function clearFilters(): void {
    setCategory("");
    setCondition("");
    setMinPrice("");
    setMaxPrice("");
    setPage(1);
  }

  function clearAll(): void {
    clearFilters();
    setSearch("");
  }

  function browseCategory(next: ListingCategory): void {
    clearAll();
    setCategory(next);
  }

  const activeFilters: ActiveFilter[] = [];
  if (category) {
    activeFilters.push({ key: "category", label: CATEGORY_LABELS[category], clear: () => resetToFirstPage(setCategory)("") });
  }
  if (condition) {
    activeFilters.push({
      key: "condition",
      label: `${CONDITION_LABELS[condition]} condition`,
      clear: () => resetToFirstPage(setCondition)(""),
    });
  }
  if (minPrice || maxPrice) {
    const label = minPrice && maxPrice ? `$${minPrice}–$${maxPrice}` : minPrice ? `From $${minPrice}` : `Up to $${maxPrice}`;
    activeFilters.push({
      key: "price",
      label,
      clear: () => {
        setMinPrice("");
        setMaxPrice("");
        setPage(1);
      },
    });
  }
  const hasSearch = debouncedSearch.trim().length > 0;
  const isNarrowed = hasSearch || activeFilters.length > 0;
  const total = query.data?.total;

  const filterFields = (
    <FilterFields
      category={category}
      condition={condition}
      minPrice={minPrice}
      maxPrice={maxPrice}
      onCategoryChange={resetToFirstPage(setCategory)}
      onConditionChange={resetToFirstPage(setCondition)}
      onMinPriceChange={resetToFirstPage(setMinPrice)}
      onMaxPriceChange={resetToFirstPage(setMaxPrice)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-h1">Browse books</h1>
        <p className="mt-1.5 text-base text-ink-muted">Second-hand books, listed directly by the readers selling them.</p>
      </header>

      <form
        role="search"
        aria-label="Filter books"
        onSubmit={(event) => event.preventDefault()}
        className="flex flex-col gap-4 border-y border-border py-4"
      >
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Search"
              hideLabel
              type="search"
              icon={Search}
              placeholder="Title or author"
              value={search}
              onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            className="min-h-11 sm:hidden"
            aria-haspopup="dialog"
            onClick={() => setIsFilterSheetOpen(true)}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Filters{activeFilters.length > 0 && ` (${activeFilters.length})`}
          </Button>
        </div>
        <div className="hidden flex-wrap items-end gap-x-4 gap-y-3 sm:flex">
          {filterFields}
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-11 px-1 text-sm font-medium text-moss-700 underline-offset-4 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-ink-muted" aria-live="polite">
          {total !== undefined && `${total} ${total === 1 ? "book" : "books"}`}
        </p>
        {activeFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={filter.clear}
            aria-label={`Remove filter: ${filter.label}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-strong px-3 text-sm text-ink transition-colors hover:border-ink-soft hover:bg-paper-muted sm:min-h-9"
          >
            {filter.label}
            <X aria-hidden="true" className="size-3.5 text-ink-muted" />
          </button>
        ))}
      </div>

      <QueryState
        isLoading={query.isPending}
        error={query.error}
        loadingSkeleton={<ListingGridSkeleton count={10} />}
      >
        {query.data && query.data.items.length === 0 ? (
          <NoResults isNarrowed={isNarrowed} onClearAll={clearAll} onBrowseCategory={browseCategory} />
        ) : (
          <div className={cn("flex flex-col gap-10 transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <div className={LISTING_GRID_CLASSES}>
              {query.data?.items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            {isNarrowed && total !== undefined && total <= FEW_RESULTS && (
              <p className="border-t border-border pt-6 text-sm text-ink-muted">
                Only {total} {total === 1 ? "book matches" : "books match"}.{" "}
                <button
                  type="button"
                  onClick={clearAll}
                  className="font-medium text-moss-700 underline underline-offset-4 hover:text-moss-600"
                >
                  Broaden your search
                </button>{" "}
                to see everything on the shelf.
              </p>
            )}
            {query.data && (
              <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={setPage} />
            )}
          </div>
        )}
      </QueryState>

      <Modal
        variant="sheet"
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Filter books"
      >
        <div className="flex flex-col gap-4">{filterFields}</div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" className="min-h-11 flex-1" disabled={activeFilters.length === 0} onClick={clearFilters}>
            Clear all
          </Button>
          <Button className="min-h-11 flex-1" onClick={() => setIsFilterSheetOpen(false)}>
            {total === undefined ? "Show books" : `Show ${total} ${total === 1 ? "book" : "books"}`}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

interface FilterFieldsProps {
  category: ListingCategory | "";
  condition: ListingCondition | "";
  minPrice: string;
  maxPrice: string;
  onCategoryChange: (value: ListingCategory | "") => void;
  onConditionChange: (value: ListingCondition | "") => void;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
}

/** Category · Condition · Price, shared by the inline row and the phone
 * sheet. Each field keeps a visible label; the two price inputs share a
 * visible "Price" legend and carry their own accessible names. */
function FilterFields(props: FilterFieldsProps): React.JSX.Element {
  return (
    <>
      <div className="sm:w-52">
        <Select
          label="Category"
          placeholder="Any category"
          options={CATEGORY_OPTIONS}
          value={props.category}
          onChange={(e) => props.onCategoryChange(e.target.value as ListingCategory | "")}
        />
      </div>
      <div className="sm:w-44">
        <Select
          label="Condition"
          placeholder="Any condition"
          options={CONDITION_OPTIONS}
          value={props.condition}
          onChange={(e) => props.onConditionChange(e.target.value as ListingCondition | "")}
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-ink">Price</legend>
        <div className="flex items-center gap-2">
          <div className="flex-1 sm:w-24 sm:flex-none">
            <Input
              label="Minimum price"
              hideLabel
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="Min"
              value={props.minPrice}
              onChange={(e) => props.onMinPriceChange(e.target.value)}
            />
          </div>
          <span aria-hidden="true" className="text-ink-soft">
            –
          </span>
          <div className="flex-1 sm:w-24 sm:flex-none">
            <Input
              label="Maximum price"
              hideLabel
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="Max"
              value={props.maxPrice}
              onChange={(e) => props.onMaxPriceChange(e.target.value)}
            />
          </div>
        </div>
      </fieldset>
    </>
  );
}

interface NoResultsProps {
  isNarrowed: boolean;
  onClearAll: () => void;
  onBrowseCategory: (category: ListingCategory) => void;
}

/** Zero results is a dead end only if it offers no way out: this states
 * plainly that nothing matched, offers to clear everything (the active
 * filters themselves are listed, removable, just above), and lists the six
 * real categories as a fresh starting point. With no search or filters at
 * all, zero results means the marketplace is genuinely empty, and says so. */
function NoResults({ isNarrowed, onClearAll, onBrowseCategory }: NoResultsProps): React.JSX.Element {
  if (!isNarrowed) {
    return (
      <section className="flex max-w-xl flex-col gap-3 py-6">
        <h2 className="font-serif text-2xl font-semibold text-ink">The shelf is empty</h2>
        <p className="text-ink-muted">No one has listed a book yet.</p>
        <Link to="/listings/new" className="w-fit font-medium text-moss-700 underline underline-offset-4 hover:text-moss-600">
          List the first book
        </Link>
      </section>
    );
  }

  return (
    <section className="flex max-w-xl flex-col gap-5 py-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold text-ink">No books match your filters</h2>
        <p className="mt-2 text-ink-muted">Try a shorter search term, or remove a filter above.</p>
      </div>
      <div>
        <Button variant="secondary" onClick={onClearAll}>
          Clear search and filters
        </Button>
      </div>
      <div>
        <h3 className="text-sm font-medium text-ink">Or start from a category</h3>
        <ul className="mt-1 flex flex-wrap gap-x-5">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <button
                type="button"
                onClick={() => onBrowseCategory(category)}
                className="min-h-11 text-sm font-medium text-moss-700 underline-offset-4 hover:underline"
              >
                {CATEGORY_LABELS[category]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
