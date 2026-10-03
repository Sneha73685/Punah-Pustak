import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";

import { BookCover } from "@/components/BookCover";
import { Button, buttonClasses } from "@/components/Button";
import { Input } from "@/components/Input";
import { ListingCard } from "@/components/ListingCard";
import { QueryState } from "@/components/QueryState";
import { ListingGridSkeleton, Skeleton } from "@/components/Skeleton";
import { useBrowseListings } from "@/hooks/useListings";
import { cn } from "@/lib/cn";
import { CATEGORY_LABELS, formatPrice } from "@/lib/listingLabels";
import type { ListingCategory, ListingPublic } from "@/api/types";

/** Newest listings, fetched once for both the hero shelf and "Just listed". */
const FETCH_COUNT = 20;
const SHELF_MAX = 5;
/** Fewer than this many books would leave the hero shelf looking like an
 * orphan rather than a shelf, so it isn't shown at all below it. */
const SHELF_MIN = 3;
const JUST_LISTED_MAX = 8;
const STAGGER_MS = 60;

/** Home's grid tops out at 4 columns (2 rows of 4 on large screens) rather
 * than the browse grid's 5, so eight books always fill whole rows. */
const HOME_GRID_CLASSES =
  "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4";

/** Cloth swatches shared with the no-photo covers, so a category's colour
 * means the same thing here as on its photo-less books. */
const CATEGORY_SPINE: Record<ListingCategory, string> = {
  fiction: "bg-cloth-fiction",
  non_fiction: "bg-cloth-non-fiction",
  academic_textbook: "bg-cloth-academic",
  children: "bg-cloth-children",
  comics_graphic_novels: "bg-cloth-comics",
  other: "bg-cloth-other",
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ListingCategory[];

const HOW_IT_WORKS = [
  { title: "List it", description: "Add the title, author and condition, a photo if you have one, and your price." },
  { title: "Find it", description: "Search by title or author, then narrow by category, condition and price." },
  {
    title: "Hand it over",
    description: "Exchanges happen between readers, off the site. Punah-Pustak doesn't handle payments or delivery.",
  },
];

/** Prefers listings with a real photo for the hero shelf, then fills any
 * remaining places with photo-less ones (shown as typographic covers). */
function pickShelf(items: ListingPublic[]): ListingPublic[] {
  const withPhoto = items.filter((item) => item.images.length > 0);
  const withoutPhoto = items.filter((item) => item.images.length === 0);
  return [...withPhoto, ...withoutPhoto].slice(0, SHELF_MAX);
}

/**
 * The homepage answers three questions in order: what this is (headline,
 * one line, search), what's here right now (the newest books — real
 * inventory, never a placeholder), and how it works. Everything shown is
 * read from the listings API; nothing is featured, ranked or counted that
 * the data doesn't support.
 */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [heroSearch, setHeroSearch] = useState("");
  const query = useBrowseListings({ page: 1, pageSize: FETCH_COUNT });

  const items = query.data?.items ?? [];
  const shelf = items.length >= SHELF_MIN ? pickShelf(items) : [];
  // Strictly the newest books, even if some also stand on the hero shelf:
  // skipping those would quietly make "Just listed" not the newest.
  const justListed = items.slice(0, JUST_LISTED_MAX);
  const isEmpty = query.data?.items.length === 0;

  function handleHeroSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = heroSearch.trim();
    navigate(trimmed ? `/listings?search=${encodeURIComponent(trimmed)}` : "/listings");
  }

  return (
    <div className="flex flex-col gap-16 pb-4 sm:gap-24">
      <section className="grid grid-cols-1 gap-10 pt-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end lg:gap-14 lg:pt-6">
        <div className="flex flex-col gap-5">
          <h1 className="max-w-[14ch] text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-display">
            Give your books a second story.
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-ink-muted">
            Buy and sell second-hand books directly with other readers.
          </p>
          <form role="search" aria-label="Search books" onSubmit={handleHeroSearch} className="flex max-w-md gap-2">
            <div className="flex-1">
              <Input
                label="Search books"
                hideLabel
                type="search"
                icon={Search}
                placeholder="Title or author"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </div>

        <HeroShelf isLoading={query.isPending} shelf={shelf} isEmpty={isEmpty} hasError={Boolean(query.error)} />
      </section>

      {/* On an empty marketplace the hero already says so; a second empty
          section here would only repeat it. */}
      {!isEmpty && (
        <section aria-labelledby="just-listed-heading" className="flex flex-col gap-6">
          <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
            <h2 id="just-listed-heading" className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Just listed
            </h2>
            <Link
              to="/listings"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-moss-700 underline-offset-4 hover:underline"
            >
              Browse all
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <QueryState
            isLoading={query.isPending}
            error={query.error}
            loadingSkeleton={<ListingGridSkeleton count={8} gridClassName={HOME_GRID_CLASSES} />}
          >
            <div className={HOME_GRID_CLASSES}>
              {justListed.map((listing, index) => (
                <div key={listing.id} className={cn(index >= 6 && "hidden lg:block")}>
                  <ListingCard listing={listing} />
                </div>
              ))}
            </div>
          </QueryState>
        </section>
      )}

      <section aria-labelledby="categories-heading" className="flex flex-col gap-6">
        <h2 id="categories-heading" className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Browse by category
        </h2>
        <ul className="grid grid-cols-1 border-t border-border sm:grid-cols-2 lg:grid-cols-3 sm:gap-x-8">
          {CATEGORIES.map((category) => (
            <li key={category} className="border-b border-border">
              <Link
                to={`/listings?category=${category}`}
                className="group flex min-h-14 items-center gap-4 py-3 text-ink transition-colors hover:text-moss-700"
              >
                <span aria-hidden="true" className={cn("h-8 w-2 shrink-0 rounded-[1px]", CATEGORY_SPINE[category])} />
                <span className="flex-1 font-serif text-lg">{CATEGORY_LABELS[category]}</span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 text-ink-soft transition-transform group-hover:text-moss-700 motion-safe:group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <h2 id="how-heading" className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          How it works
        </h2>
        <ol className="grid grid-cols-1 gap-6 border-t border-border pt-6 sm:grid-cols-3 sm:gap-8">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 sm:block">
              <span aria-hidden="true" className="font-serif text-2xl font-semibold text-moss-600 lining-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="sm:mt-2">
                <h3 className="text-base font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="sell-heading"
        className="flex flex-col gap-5 rounded-lg bg-paper-muted px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 sm:py-10"
      >
        <div>
          <h2 id="sell-heading" className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Good books deserve another reader.
          </h2>
          <p className="mt-2 text-base text-ink-muted">Finished with a book? List it for the next person.</p>
        </div>
        <Link to="/listings/new" className={buttonClasses("primary", "shrink-0 self-start sm:self-auto")}>
          Sell a book
        </Link>
      </section>
    </div>
  );
}

interface HeroShelfProps {
  isLoading: boolean;
  shelf: ListingPublic[];
  isEmpty: boolean;
  hasError: boolean;
}

/**
 * Up to five of the newest real books standing upright on one baseline
 * (four beside the headline on large screens, where five would shrink
 * each cover too far). Desktop/tablet: equal slots in a row, each cover at
 * its true shape,
 * bottoms aligned on a hairline. Phones: the same row as a horizontal
 * scroll-snap shelf showing two and a half books, so it's evident there's
 * more to swipe to. The books arrive once with a short stagger (transform
 * only, skipped under reduced motion).
 *
 * Shown only with at least `SHELF_MIN` books, so a near-empty marketplace
 * never gets a lone orphaned cover in the hero. Zero listings get an
 * honest empty-shelf line instead; an error or too few books leave this
 * space empty (the "Just listed" section below reports errors).
 */
function HeroShelf({ isLoading, shelf, isEmpty, hasError }: HeroShelfProps): React.JSX.Element | null {
  if (isLoading) {
    // Same row, same slots, as the loaded shelf, so the books arriving
    // don't push the rest of the page down.
    return (
      <ShelfRow label="Loading newest books">
        {Array.from({ length: SHELF_MAX }, (_, index) => (
          <ShelfSlot key={index} index={index}>
            <Skeleton className="aspect-[2/3] w-full rounded-xs" />
          </ShelfSlot>
        ))}
      </ShelfRow>
    );
  }
  if (isEmpty) {
    return (
      <div className="flex flex-col gap-2 border-b border-border-strong pb-6 lg:pb-8">
        <p className="font-serif text-2xl text-ink">The shelf is empty.</p>
        <Link to="/listings/new" className="w-fit font-medium text-moss-700 underline underline-offset-4 hover:text-moss-600">
          List the first book
        </Link>
      </div>
    );
  }
  if (hasError || shelf.length === 0) {
    return null;
  }

  return (
    <ShelfRow label="Newest books">
      {shelf.map((listing, index) => (
        <ShelfSlot key={listing.id} index={index} className="animate-shelf-in" style={{ animationDelay: `${index * STAGGER_MS}ms` }}>
          <Link
            to={`/listings/${listing.id}`}
            aria-label={`${listing.title} by ${listing.author}, ${formatPrice(listing.price)}`}
            className="group block"
          >
            <BookCover
              size="card"
              interactive
              title={listing.title}
              author={listing.author}
              category={listing.category}
              image={listing.images[0] ? { url: listing.images[0].url, alt: "" } : undefined}
            />
          </Link>
        </ShelfSlot>
      ))}
    </ShelfRow>
  );
}

function ShelfRow({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="-mx-4 sm:mx-0">
      <ul
        aria-label={label}
        className="flex snap-x snap-mandatory items-end gap-3 overflow-x-auto px-4 pb-px sm:grid sm:grid-cols-5 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4"
      >
        {children}
      </ul>
      <div aria-hidden="true" className="mx-4 border-b border-border-strong sm:mx-0" />
    </div>
  );
}

function ShelfSlot({
  index,
  className,
  style,
  children,
}: {
  index: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className={cn("w-[38%] shrink-0 snap-start sm:w-auto", index === SHELF_MAX - 1 && "lg:hidden", className)} style={style}>
      {children}
    </li>
  );
}
