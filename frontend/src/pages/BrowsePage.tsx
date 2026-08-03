import { useState } from "react";

import { Input } from "@/components/Input";
import { ListingCard } from "@/components/ListingCard";
import { Pagination } from "@/components/Pagination";
import { QueryState } from "@/components/QueryState";
import { Select } from "@/components/Select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useBrowseListings } from "@/hooks/useListings";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/listingLabels";
import type { ListingCategory, ListingCondition } from "@/api/types";

const PAGE_SIZE = 20;

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const CONDITION_OPTIONS = Object.entries(CONDITION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** FR-001..004, UC-1: public browse/search/filter, paginated. */
export function BrowsePage(): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ListingCategory | "">("");
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
      <h1 className="text-2xl font-semibold text-slate-900">Browse listings</h1>

      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
        role="search"
        aria-label="Filter listings"
        onSubmit={(event) => event.preventDefault()}
      >
        <Input
          label="Search"
          placeholder="Title or author"
          value={search}
          onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
        />
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
      </form>

      <QueryState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.items.length === 0}
        emptyMessage="No listings match your filters."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {query.data?.items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
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
