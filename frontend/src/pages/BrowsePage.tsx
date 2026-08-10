import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen } from "lucide-react";

import { Input } from "@/components/Input";
import { ListingCard } from "@/components/ListingCard";
import { ListingGridSkeleton } from "@/components/Skeleton";
import { PageHeader } from "@/components/PageHeader";
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

/** FR-001..004, UC-1: public browse/search/filter, paginated. The initial
 * search term can arrive via a `?search=` query param (set by `HomePage`'s
 * hero search) — purely a convenience read on mount, this page still owns
 * its own filter state exactly as before. */
export function BrowsePage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
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
      <PageHeader
        title="Browse books"
        description="Search a growing shelf of second-hand books listed directly by their owners."
      />

      <form
        className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-card sm:p-5"
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
