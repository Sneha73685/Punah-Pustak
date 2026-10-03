import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { buttonClasses } from "@/components/Button";
import { ConditionMeter } from "@/components/ConditionMeter";
import { ListingCard } from "@/components/ListingCard";
import { PhotoFrame } from "@/components/PhotoFrame";
import { QueryState } from "@/components/QueryState";
import { ListingGridSkeleton } from "@/components/Skeleton";
import { useBrowseListings } from "@/hooks/useListings";
import { cn } from "@/lib/cn";
import { HOME_GRID_CLASSES } from "@/lib/layout";
import { CATEGORY_LABELS, formatDay, formatPrice } from "@/lib/listingLabels";
import type { BrowseFilters } from "@/api/listings";
import type { ListingCategory, ListingPublic } from "@/api/types";

const JUST_IN_COUNT = 10;

/** Per-position visibility for "Just in" (see the grid below). */
const JUST_IN_VISIBILITY: Record<number, string> = {
  6: "hidden sm:block",
  7: "hidden sm:block",
  8: "hidden sm:block lg:hidden xl:block",
  9: "hidden xl:block",
};
const LIST_COUNT = 5;
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ListingCategory[];

/** Each list on the home page is a real browse query, and its "All" link
 * opens Browse with exactly that query. Nothing is curated or ranked. */
interface IndexList {
  id: string;
  title: string;
  /** The query, in words, under the heading. */
  query: string;
  filters: BrowseFilters;
  href: string;
}

const INDEX_LISTS: IndexList[] = [
  { id: "under-5", title: "Under $5", query: "price under $5", filters: { maxPrice: 4.99 }, href: "/listings?max_price=4.99" },
  { id: "barely-read", title: "Barely read", query: "condition: like new", filters: { condition: "like_new" }, href: "/listings?condition=like_new" },
  { id: "textbooks", title: "Textbooks", query: "category: academic textbook", filters: { category: "academic_textbook" }, href: "/listings?category=academic_textbook" },
];

/**
 * The homepage is the catalogue's front page, not a landing page: one line
 * saying what this is, the search field as the main object, and then the
 * newest copies themselves as the visual opening. Below them, three ruled
 * lists that are each a real query, the categories as a plain index, and
 * the one band that asks a reader to list a copy. Everything shown is read
 * from the listings API; nothing is featured, ranked or counted that the
 * API doesn't support.
 */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const query = useBrowseListings({ page: 1, pageSize: JUST_IN_COUNT });

  const total = query.data?.total;
  const items = query.data?.items ?? [];
  const isEmpty = query.data !== undefined && items.length === 0;

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = search.trim();
    navigate(trimmed ? `/listings?search=${encodeURIComponent(trimmed)}` : "/listings");
  }

  return (
    <div className="flex flex-col">
      <section className="pt-7 sm:pt-11">
        <h1 className="text-[28px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[36px] lg:text-44">
          Second-hand books, examined and passed on by readers.
        </h1>
        <form role="search" aria-label="Search books" onSubmit={handleSearch} className="mt-5 sm:mt-6">
          <div className="flex rounded-xs border-2 border-ink bg-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ballpoint focus-within:[outline-style:solid]">
            <label htmlFor="home-search" className="sr-only">
              Search books
            </label>
            <input
              id="home-search"
              type="search"
              placeholder="Title or author"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-[52px] min-w-0 flex-1 bg-transparent px-3.5 text-17 text-ink placeholder:text-ink-2 focus:outline-none sm:h-[60px] sm:px-5 sm:text-[20px]"
            />
            <button type="submit" className="bg-ink px-4 text-15 font-semibold text-ground hover:bg-black sm:px-7 sm:text-[16px]">
              Search
            </button>
          </div>
        </form>
        <p className="tnum mt-3 min-h-5 font-mono text-13 text-ink-2">
          {total !== undefined && total > 0 && (
            <>
              {total} {total === 1 ? "copy" : "copies"} on offer · newest listed {formatDay(items[0].created_at)}
            </>
          )}
        </p>
      </section>

      <section aria-labelledby="just-in-heading" className="mt-10 sm:mt-14">
        <SectionHead
          id="just-in-heading"
          title="Just in"
          link={isEmpty ? undefined : { to: "/listings", label: "Browse all" }}
          query={total ? "newest first" : undefined}
        />
        <QueryState
          isLoading={query.isPending}
          error={query.error}
          loadingSkeleton={<ListingGridSkeleton count={JUST_IN_COUNT} gridClassName={HOME_GRID_CLASSES} />}
        >
          {isEmpty ? (
            <div className="flex flex-col gap-2 py-2">
              <p className="text-22 font-bold text-ink">Nothing is listed yet.</p>
              <Link to="/listings/new" className="w-fit text-15 font-medium text-ballpoint underline underline-offset-4">
                List the first book
              </Link>
            </div>
          ) : (
            <div className={HOME_GRID_CLASSES}>
              {items.map((listing, index) => (
                // Only whole rows: 6 copies in 2 columns, 9 in 3, 8 in 4,
                // and all 10 in 5, so the grid never ends on an orphan.
                <div key={listing.id} className={cn(JUST_IN_VISIBILITY[index])}>
                  <ListingCard listing={listing} />
                </div>
              ))}
            </div>
          )}
        </QueryState>
      </section>

      {!isEmpty && !query.error && (
        <div className="mt-14 grid grid-cols-1 gap-y-12 sm:mt-16 md:grid-cols-2 md:gap-x-6 lg:grid-cols-3">
          {INDEX_LISTS.map((list) => (
            <IndexListSection key={list.id} list={list} />
          ))}
        </div>
      )}

      <section aria-labelledby="categories-heading" className="mt-14 sm:mt-16">
        <SectionHead id="categories-heading" title="By category" />
        <ul className="grid grid-cols-1 gap-x-6 md:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                to={`/listings?category=${category}`}
                className="flex min-h-12 items-center border-b border-rule py-3 text-17 font-semibold tracking-[-0.01em] text-ink hover:underline hover:underline-offset-4 sm:text-22"
              >
                {CATEGORY_LABELS[category]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="list-a-copy-heading"
        className="mt-16 grid grid-cols-1 gap-x-10 gap-y-3 border-t-[3px] border-ballpoint pt-6 sm:mt-20 md:grid-cols-[1fr_auto] md:items-center"
      >
        <div>
          <h2 id="list-a-copy-heading" className="text-22 font-bold tracking-[-0.01em] text-ink">
            Finished with a book?
          </h2>
          <p className="mt-1 max-w-[70ch] text-15 text-ink-2">
            Photograph your copy as it is, say what wear it has, and set a price. Exchange happens between you and the
            buyer, off-site: Punah-Pustak doesn&apos;t handle payment or delivery.
          </p>
        </div>
        <Link to="/listings/new" className={buttonClasses("primary", "justify-self-start md:justify-self-end")}>
          List a copy
        </Link>
      </section>
    </div>
  );
}

interface SectionHeadProps {
  id: string;
  title: string;
  link?: { to: string; label: string };
  query?: string;
}

/** A section opens on a full-width ink rule: the heading, its link, and
 * the query it shows in small record type. */
function SectionHead({ id, title, link, query }: SectionHeadProps): React.JSX.Element {
  return (
    <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-ink pt-3.5 sm:mb-6">
      <h2 id={id} className="text-[19px] font-bold tracking-[-0.015em] text-ink sm:text-22">
        {title}
      </h2>
      {link && (
        <Link to={link.to} className="inline-flex min-h-11 items-center text-15 font-medium text-ballpoint underline decoration-1 underline-offset-[3px] hover:decoration-2 sm:min-h-0">
          {link.label}
        </Link>
      )}
      {query && <span className="tnum basis-full font-mono text-13 text-ink-2 sm:basis-auto">{query}</span>}
    </div>
  );
}

/** A query-backed list: up to five compact records under a ruled head.
 * Hidden entirely when the query is empty or fails (the "Just in" section
 * above already reports a failing catalogue), so the page never shows an
 * empty heading. */
function IndexListSection({ list }: { list: IndexList }): React.JSX.Element | null {
  const query = useBrowseListings({ ...list.filters, page: 1, pageSize: LIST_COUNT });
  const items = query.data?.items ?? [];
  if (query.isPending || query.error || items.length === 0) {
    return null;
  }
  const headingId = `${list.id}-heading`;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 border-t border-ink pt-3.5">
        <h2 id={headingId} className="flex-1 text-[19px] font-bold tracking-[-0.015em] text-ink sm:text-22">
          {list.title}
        </h2>
        <Link
          to={list.href}
          aria-label={`All ${query.data!.total} ${list.title.toLowerCase()}`}
          className="tnum inline-flex min-h-11 items-center text-15 font-medium text-ballpoint underline decoration-1 underline-offset-[3px] hover:decoration-2 sm:min-h-0"
        >
          All {query.data!.total}
        </Link>
        <span className="basis-full font-mono text-13 text-ink-2">{list.query}</span>
      </div>
      <ol>
        {items.map((listing) => (
          <li key={listing.id}>
            <IndexRow listing={listing} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function IndexRow({ listing }: { listing: ListingPublic }): React.JSX.Element {
  const firstImage = listing.images[0];
  return (
    <Link
      to={`/listings/${listing.id}`}
      className="group relative grid grid-cols-[72px_minmax(0,1fr)] gap-3.5 border-b border-rule py-3 sm:grid-cols-[88px_minmax(0,1fr)]"
    >
      <PhotoFrame
        variant="thumb"
        announceNoPhoto={false}
        title={listing.title}
        author={listing.author}
        image={firstImage ? { url: firstImage.url, alt: "" } : undefined}
      />
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-2 text-15 font-semibold leading-snug text-ink [overflow-wrap:anywhere] decoration-1 underline-offset-[3px] group-hover:underline">
          {listing.title}
        </span>
        <span className="truncate text-13 text-ink-2">{listing.author}</span>
        <span className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-15 font-bold text-ink">{formatPrice(listing.price)}</span>
          <ConditionMeter condition={listing.condition} />
        </span>
        {!firstImage && <span className="sr-only">, no photo yet</span>}
        <span className="sr-only">, from {listing.seller_display_name}</span>
      </span>
    </Link>
  );
}
