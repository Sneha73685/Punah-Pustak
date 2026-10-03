import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/Button";
import { ConditionMeter } from "@/components/ConditionMeter";
import { Input } from "@/components/Input";
import { ListingCard } from "@/components/ListingCard";
import { Modal } from "@/components/Modal";
import { Pagination } from "@/components/Pagination";
import { QueryState } from "@/components/QueryState";
import { ListingGridSkeleton } from "@/components/Skeleton";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useBrowseListings } from "@/hooks/useListings";
import { cn } from "@/lib/cn";
import { LISTING_GRID_CLASSES } from "@/lib/layout";
import { CATEGORY_LABELS, CONDITION_LABELS, CONDITIONS_BEST_FIRST } from "@/lib/listingLabels";
import type { ListingCategory, ListingCondition } from "@/api/types";

/** 24 divides evenly into the 2-, 3- and 4-column grids, so a full page
 * never ends on a ragged row. */
const PAGE_SIZE = 24;

/** At or below this many results for a narrowed search, suggest widening it. */
const FEW_RESULTS = 3;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ListingCategory[];

/** One-tap price ranges. "Under $5" stops at $4.99 because the API's
 * maximum is inclusive. */
const PRICE_PRESETS = [
  { label: "Under $5", min: "", max: "4.99" },
  { label: "$5-15", min: "5", max: "15" },
  { label: "$15+", min: "15", max: "" },
] as const;

function categoryFromParams(params: URLSearchParams): ListingCategory | "" {
  const value = params.get("category");
  return value && value in CATEGORY_LABELS ? (value as ListingCategory) : "";
}

function conditionFromParams(params: URLSearchParams): ListingCondition | "" {
  const value = params.get("condition");
  return value && value in CONDITION_LABELS ? (value as ListingCondition) : "";
}

function priceFromParams(params: URLSearchParams, key: "min_price" | "max_price"): string {
  const value = params.get(key);
  return value && !Number.isNaN(Number(value)) ? value : "";
}

function priceLabel(min: string, max: string): string {
  const preset = PRICE_PRESETS.find((p) => p.min === min && p.max === max);
  if (preset) return preset.label;
  if (min && max) return `$${min}-$${max}`;
  return min ? `From $${min}` : `Up to $${max}`;
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
 * From 1024px the filters are a sticky 240px column beside the results;
 * below that, the search field and a "Filters · n" button stay pinned to
 * the top of the screen and the filters open in a bottom sheet, so copies
 * start on the first screen. Both render the same `FilterFields` bound to
 * the same state, so they can never disagree.
 *
 * The URL seeds this page's state (Home's lists and category index link
 * here with a query); filter changes don't write back to it.
 */
export function BrowsePage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [category, setCategory] = useState<ListingCategory | "">(categoryFromParams(searchParams));
  const [condition, setCondition] = useState<ListingCondition | "">(conditionFromParams(searchParams));
  const [minPrice, setMinPrice] = useState(priceFromParams(searchParams, "min_price"));
  const [maxPrice, setMaxPrice] = useState(priceFromParams(searchParams, "max_price"));
  const [page, setPage] = useState(1);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // A link to `/listings?…` followed while this page is already mounted
  // (the footer's Browse link, say) changes the URL without remounting, so
  // re-seed from it when it changes.
  const paramsKey = searchParams.toString();
  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
    setCategory(categoryFromParams(searchParams));
    setCondition(conditionFromParams(searchParams));
    setMinPrice(priceFromParams(searchParams, "min_price"));
    setMaxPrice(priceFromParams(searchParams, "max_price"));
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

  function setPriceRange(min: string, max: string): void {
    setMinPrice(min);
    setMaxPrice(max);
    setPage(1);
  }

  function clearFilters(): void {
    setCategory("");
    setCondition("");
    setPriceRange("", "");
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
    activeFilters.push({ key: "condition", label: CONDITION_LABELS[condition], clear: () => resetToFirstPage(setCondition)("") });
  }
  if (minPrice || maxPrice) {
    activeFilters.push({ key: "price", label: priceLabel(minPrice, maxPrice), clear: () => setPriceRange("", "") });
  }
  const hasSearch = debouncedSearch.trim().length > 0;
  const isNarrowed = hasSearch || activeFilters.length > 0;
  const total = query.data?.total;

  function filterFields(idPrefix: string): React.JSX.Element {
    return (
      <FilterFields
        idPrefix={idPrefix}
        category={category}
        condition={condition}
        minPrice={minPrice}
        maxPrice={maxPrice}
        onCategoryChange={resetToFirstPage(setCategory)}
        onConditionChange={resetToFirstPage(setCondition)}
        onMinPriceChange={resetToFirstPage(setMinPrice)}
        onMaxPriceChange={resetToFirstPage(setMaxPrice)}
        onPreset={setPriceRange}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 items-end gap-x-12 gap-y-4 pt-6 sm:pt-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <h1 className="text-[26px] font-bold leading-none tracking-[-0.02em] text-ink sm:text-30">Browse copies</h1>

        {/* Pinned to the top of the screen below 1024px, with the Filters
            button beside it; a plain row above the results from 1024px. */}
        <div className="sticky top-0 z-20 -mx-4 flex gap-2 border-b border-ink bg-ground px-4 py-2.5 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:p-0">
          <form role="search" aria-label="Filter books" onSubmit={(event) => event.preventDefault()} className="flex-1">
            <label htmlFor="browse-search" className="sr-only">
              Search
            </label>
            <input
              id="browse-search"
              type="search"
              placeholder="Title or author"
              value={search}
              onChange={(event) => resetToFirstPage(setSearch)(event.target.value)}
              className="h-11 w-full rounded-xs border border-ink bg-white px-3 text-[16px] text-ink placeholder:text-ink-2 focus-visible:outline-offset-0 lg:h-12 lg:border-2 lg:px-4 lg:text-17"
            />
          </form>
          <Button
            variant="secondary"
            className="border-ink px-3.5 lg:hidden"
            aria-haspopup="dialog"
            onClick={() => setIsFilterSheetOpen(true)}
          >
            Filters{activeFilters.length > 0 && ` · ${activeFilters.length}`}
          </Button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 items-start gap-x-12 lg:mt-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside aria-label="Filters" className="sticky top-6 hidden border-t border-ink lg:block">
          {filterFields("side")}
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 min-h-11 text-15 font-medium text-ballpoint underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
        </aside>

        <section aria-label="Results" className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 pb-5 pt-3 lg:border-t lg:border-ink">
            <p className="tnum text-[18px] font-bold tracking-[-0.015em] text-ink sm:text-22" aria-live="polite">
              {total !== undefined && `${total} ${total === 1 ? "copy" : "copies"}`}
            </p>
            {activeFilters.length > 0 ? (
              <>
                <ul className="order-3 flex basis-full flex-wrap gap-x-5 sm:order-none sm:basis-auto">
                  {activeFilters.map((filter) => (
                    <li key={filter.key}>
                      <button
                        type="button"
                        onClick={filter.clear}
                        aria-label={`Remove filter: ${filter.label}`}
                        className="inline-flex min-h-11 items-baseline gap-1.5 text-15 font-semibold text-ink hover:underline hover:underline-offset-4 sm:min-h-0"
                      >
                        {filter.label}
                        <span aria-hidden="true" className="font-normal text-ink-2">
                          ×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-auto min-h-11 text-15 font-medium text-ballpoint underline underline-offset-4 sm:min-h-0"
                >
                  Clear all
                </button>
              </>
            ) : (
              <span className="ml-auto font-mono text-13 text-ink-2">newest first</span>
            )}
          </div>

          <QueryState
            isLoading={query.isPending}
            error={query.error}
            loadingSkeleton={<ListingGridSkeleton count={12} />}
          >
            {query.data && query.data.items.length === 0 ? (
              <NoResults isNarrowed={isNarrowed} onClearAll={clearAll} onBrowseCategory={browseCategory} />
            ) : (
              <div className={cn("flex flex-col gap-12 transition-opacity", query.isPlaceholderData && "opacity-60")}>
                <div className={LISTING_GRID_CLASSES}>
                  {query.data?.items.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
                {isNarrowed && total !== undefined && total <= FEW_RESULTS && (
                  <p className="border-t border-rule pt-5 text-15 text-ink-2">
                    Only {total} {total === 1 ? "copy matches" : "copies match"}.{" "}
                    <button type="button" onClick={clearAll} className="font-medium text-ballpoint underline underline-offset-4">
                      Clear the search and filters
                    </button>{" "}
                    to see every copy.
                  </p>
                )}
                {query.data && <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={setPage} />}
              </div>
            )}
          </QueryState>
        </section>
      </div>

      <Modal variant="sheet" isOpen={isFilterSheetOpen} onClose={() => setIsFilterSheetOpen(false)} title="Filter copies">
        {filterFields("sheet")}
        <div className="sticky -bottom-4 -mx-4 -mb-4 mt-4 flex gap-3 border-t border-rule bg-ground px-4 pb-4 pt-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
          <Button variant="secondary" className="flex-1" disabled={activeFilters.length === 0} onClick={clearFilters}>
            Clear all
          </Button>
          <Button className="flex-1" onClick={() => setIsFilterSheetOpen(false)}>
            {total === undefined ? "Show copies" : `Show ${total} ${total === 1 ? "copy" : "copies"}`}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

interface FilterFieldsProps {
  idPrefix: string;
  category: ListingCategory | "";
  condition: ListingCondition | "";
  minPrice: string;
  maxPrice: string;
  onCategoryChange: (value: ListingCategory | "") => void;
  onConditionChange: (value: ListingCondition | "") => void;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
  onPreset: (min: string, max: string) => void;
}

const GROUP_CLASSES = "border-b border-rule pb-4 pt-4";
const LEGEND_CLASSES = "float-left mb-2 w-full text-13 font-bold text-ink";
const OPTION_CLASSES =
  "clear-left flex min-h-11 cursor-pointer items-center gap-2.5 text-15 text-ink lg:min-h-[34px] has-[:checked]:font-semibold";

/** Category · Condition · Price, shared by the filter column and the phone
 * sheet. Every group is a fieldset with a visible legend; condition is the
 * five-step meter itself, so the filter and the listings speak the same
 * scale. */
function FilterFields(props: FilterFieldsProps): React.JSX.Element {
  const { idPrefix } = props;
  return (
    <>
      <fieldset className={GROUP_CLASSES}>
        <legend className={LEGEND_CLASSES}>Category</legend>
        {(["", ...CATEGORIES] as const).map((value) => (
          <label key={value || "any"} className={OPTION_CLASSES}>
            <input
              type="radio"
              name={`${idPrefix}-category`}
              checked={props.category === value}
              onChange={() => props.onCategoryChange(value)}
              className="size-4 accent-ballpoint"
            />
            {value ? CATEGORY_LABELS[value] : "Any category"}
          </label>
        ))}
      </fieldset>

      <fieldset className={GROUP_CLASSES}>
        <legend className={LEGEND_CLASSES}>Condition</legend>
        {(["", ...CONDITIONS_BEST_FIRST] as const).map((value) => (
          <label
            key={value || "any"}
            className={cn(
              OPTION_CLASSES,
              "-ml-3 border-l-2 border-transparent pl-2.5 has-[:checked]:border-ballpoint",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ballpoint has-[:focus-visible]:[outline-style:solid]",
            )}
          >
            <input
              type="radio"
              name={`${idPrefix}-condition`}
              checked={props.condition === value}
              onChange={() => props.onConditionChange(value)}
              className="sr-only"
            />
            {value ? <ConditionMeter condition={value} /> : "Any condition"}
          </label>
        ))}
      </fieldset>

      <fieldset className={GROUP_CLASSES}>
        <legend className={LEGEND_CLASSES}>Price</legend>
        <div className="clear-left flex items-center gap-2">
          <div className="flex-1">
            <Input
              id={`${idPrefix}-min-price`}
              label="Minimum price"
              hideLabel
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="$ min"
              value={props.minPrice}
              onChange={(e) => props.onMinPriceChange(e.target.value)}
            />
          </div>
          <span aria-hidden="true" className="text-ink-2">
            -
          </span>
          <div className="flex-1">
            <Input
              id={`${idPrefix}-max-price`}
              label="Maximum price"
              hideLabel
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="$ max"
              value={props.maxPrice}
              onChange={(e) => props.onMaxPriceChange(e.target.value)}
            />
          </div>
        </div>
        <div role="group" aria-label="Price ranges" className="mt-2 flex flex-wrap gap-x-4">
          {PRICE_PRESETS.map((preset) => {
            const isOn = props.minPrice === preset.min && props.maxPrice === preset.max;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={isOn}
                onClick={() => (isOn ? props.onPreset("", "") : props.onPreset(preset.min, preset.max))}
                className={cn(
                  "inline-flex min-h-11 items-center text-15 text-ink lg:min-h-9",
                  isOn ? "font-bold shadow-[inset_0_-2px_0_var(--color-ballpoint)]" : "hover:underline hover:underline-offset-4",
                )}
              >
                {preset.label}
              </button>
            );
          })}
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
 * categories as a fresh start. With no search or filters at all, zero
 * results means the marketplace is genuinely empty, and says so. */
function NoResults({ isNarrowed, onClearAll, onBrowseCategory }: NoResultsProps): React.JSX.Element {
  if (!isNarrowed) {
    return (
      <section className="flex max-w-xl flex-col gap-2 py-4">
        <h2 className="text-22 font-bold text-ink">Nothing is listed yet</h2>
        <p className="text-15 text-ink-2">No one has listed a copy so far.</p>
        <Link to="/listings/new" className="w-fit text-15 font-medium text-ballpoint underline underline-offset-4">
          List the first book
        </Link>
      </section>
    );
  }

  return (
    <section className="flex max-w-xl flex-col gap-5 py-4">
      <div>
        <h2 className="text-22 font-bold text-ink">No books match your filters</h2>
        <p className="mt-2 text-15 text-ink-2">Try a shorter search term, or remove a filter above.</p>
      </div>
      <div>
        <Button variant="secondary" onClick={onClearAll}>
          Clear search and filters
        </Button>
      </div>
      <div>
        <h3 className="text-13 font-bold text-ink">Or start from a category</h3>
        <ul className="mt-1 flex flex-wrap gap-x-5">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <button
                type="button"
                onClick={() => onBrowseCategory(category)}
                className="min-h-11 text-15 font-medium text-ballpoint underline underline-offset-4"
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
