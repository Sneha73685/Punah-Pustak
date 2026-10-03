import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Leaf, PlusCircle, Recycle, Search, Wallet } from "lucide-react";

import { BookCover } from "@/components/BookCover";
import { Button } from "@/components/Button";
import { BookCoverGlyph } from "@/components/NoCoverPlaceholder";
import { Input } from "@/components/Input";
import { ListingCard } from "@/components/ListingCard";
import { ListingGridSkeleton } from "@/components/Skeleton";
import { QueryState } from "@/components/QueryState";
import { cn } from "@/lib/cn";
import { useBrowseListings } from "@/hooks/useListings";
import type { ListingPublic } from "@/api/types";

/** No icons here deliberately (Phase 1B) — the step numerals themselves
 * are the section's visual anchor, not a third icon-badge pattern on the
 * same page as the hero pill and the value-prop list below. The sequence
 * is real information (list, then it's findable, then you meet), which is
 * the one case a numbered presentation earns its keep.
 *
 * Phase 3: the third step's numeral breaks from moss to clay — the
 * established "clay is the human/editorial accent" role (see `BookCover`
 * and the catalogue metadata treatment) applied here to the one step that
 * is itself a human moment (meeting the seller), not a system action. */
const HOW_IT_WORKS = [
  {
    title: "List it",
    description: "Snap a few photos, describe the book's condition, and set your price.",
  },
  {
    title: "Find it",
    description: "Search and filter by title, author, category, condition, or price.",
  },
  {
    title: "Meet & exchange",
    description: "Connect with the seller directly and hand off the book, off-platform.",
  },
];

const VALUE_PROPS = [
  {
    icon: Leaf,
    title: "Less waste",
    description: "Every book resold is one less printed, shipped, or pulped from scratch.",
  },
  {
    icon: Wallet,
    title: "Fair prices",
    description: "Buy and sell at a fraction of retail — good books deserve more than one reader.",
  },
  {
    icon: Recycle,
    title: "Built to circulate",
    description: "A book's story doesn't end on your shelf. Pass it on when you're done.",
  },
];

const STAGGER_MS = 60;
const HERO_ITEM_COUNT = 3;

/** FE-002: the app's real landing page at `/` — distinct from `/listings`
 * (Browse), per the brand direction of a marketplace visitors arrive at
 * before they browse. Renders real data via `useBrowseListings` (FR-001..
 * 004's existing query) rather than any hardcoded "featured" list; an empty
 * database gets a first-visit empty state instead of a blank section. */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [heroSearch, setHeroSearch] = useState("");
  // Phase 3: one extra page of results over what "Current arrivals" alone
  // needed — the hero's own book arrangement and the grid below it draw
  // from the same single fetch, split rather than duplicated, so the two
  // newest listings a visitor sees are never shown to them twice on one
  // page (see `HeroBookArrangement`'s own doc comment).
  const featuredQuery = useBrowseListings({ page: 1, pageSize: 3 + 6 });
  const items = featuredQuery.data?.items;
  const heroItems = items?.slice(0, HERO_ITEM_COUNT);
  // Only exclude the hero's own items from the grid once there's enough
  // inventory that doing so still leaves a real grid behind (see
  // `HeroBookArrangement`'s doc comment on not duplicating listings) — a
  // marketplace with only 1-2 books total shows them in both places rather
  // than making its only listings' titles invisible everywhere, since the
  // hero arrangement itself never renders text, only the object.
  const gridItems = items && items.length > HERO_ITEM_COUNT ? items.slice(HERO_ITEM_COUNT) : items;

  function handleHeroSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = heroSearch.trim();
    navigate(trimmed ? `/listings?search=${encodeURIComponent(trimmed)}` : "/listings");
  }

  return (
    <div className="flex flex-col gap-24 overflow-x-clip pb-8 sm:gap-28">
      {/* Hero */}
      <section className="relative isolate">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-6 -top-24 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_20%_20%,rgba(63,107,82,0.10),transparent_65%),radial-gradient(45%_55%_at_85%_10%,rgba(181,87,58,0.08),transparent_60%)]"
        />
        <div className="grid grid-cols-1 items-center gap-10 pt-4 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
          <div className="animate-fade-up flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-moss-50 px-3 py-1 text-xs font-medium text-moss-700">
              <BookOpen aria-hidden="true" className="size-3.5" />
              Peer-to-peer &middot; second-hand books
            </span>
            <h1 className="font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Give your books a <em className="text-clay-600 not-italic">second story</em>.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-ink-muted sm:text-lg">
              Punah-Pustak connects readers who are done with a book to readers who are just
              starting theirs — buy and sell second-hand books directly, without a middleman.
            </p>
            <form
              role="search"
              aria-label="Search books"
              onSubmit={handleHeroSearch}
              className="flex max-w-md flex-col gap-2 rounded-2xl border border-border bg-white/80 p-2.5 shadow-lift backdrop-blur-sm sm:flex-row sm:items-center"
            >
              <div className="flex-1">
                <Input
                  label="Search books"
                  hideLabel
                  icon={Search}
                  variant="ghost"
                  placeholder="Search by title or author"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                />
              </div>
              <Button type="submit" className="sm:shrink-0">
                <Search aria-hidden="true" className="size-4" />
                Search
              </Button>
            </form>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => navigate("/listings")}>
                Browse Books
              </Button>
              <Button variant="secondary" onClick={() => navigate("/listings/new")}>
                <PlusCircle aria-hidden="true" className="size-4" />
                Sell a Book
              </Button>
            </div>
          </div>

          {/* Phase 3: real listings, not a vector illustration — see
              `HeroBookArrangement`'s own doc comment for why, and for how
              it degrades (never disappears) with zero cover photos. No
              longer `hidden lg:block`: at `grid-cols-1` below `lg` this is
              simply the grid's second row, giving the mobile hero its own
              closing beat instead of Phase 0's dead gap under the CTAs. */}
          {heroItems && heroItems.length > 0 && (
            <div className="flex justify-center lg:justify-end">
              <HeroBookArrangement items={heroItems} />
            </div>
          )}
        </div>
      </section>

      {/* Current arrivals — an editorial rail beside the grid, not a
          centered heading on top of it. `animateEntrance` on the cards
          below is deliberately opted in ONLY here (Phase 3 motion pass):
          this is the one grid on the site whose mount is a genuine
          "you've arrived at the homepage" moment, not the routine result
          of typing into a search box or flipping a page — see
          `ListingCard`'s own doc comment for why it defaults off. */}
      <section className="flex flex-col gap-8 lg:grid lg:grid-cols-[240px_1fr] lg:gap-14">
        <div className="flex flex-row items-end justify-between gap-4 border-b border-border pb-6 lg:flex-col lg:items-start lg:justify-start lg:border-b-0 lg:border-r lg:border-border lg:pb-0 lg:pr-8">
          <div>
            <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Current arrivals
            </h2>
            <p className="mt-2 max-w-[22ch] text-sm leading-relaxed text-ink-muted">
              What just found its way onto the shelf.
            </p>
          </div>
          <Link
            to="/listings"
            className="shrink-0 text-sm font-medium text-moss-600 transition-colors hover:text-moss-700 hover:underline lg:mt-6"
          >
            View all &rarr;
          </Link>
        </div>

        <QueryState
          isLoading={featuredQuery.isPending}
          error={featuredQuery.error}
          isEmpty={featuredQuery.data?.items.length === 0}
          loadingSkeleton={<ListingGridSkeleton count={4} />}
          emptyState={{
            icon: BookOpen,
            title: "No books listed yet",
            description:
              "Punah-Pustak is brand new here — be the first to give a book a second reader.",
            action: (
              <Button onClick={() => navigate("/listings/new")}>
                <PlusCircle aria-hidden="true" className="size-4" />
                Sell your first book
              </Button>
            ),
          }}
        >
          {gridItems && gridItems.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {gridItems.map((listing, index) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  animateEntrance
                  style={{ animationDelay: `${index * STAGGER_MS}ms` }}
                />
              ))}
            </div>
          )}
        </QueryState>
      </section>

      {/* How it works — an editorial sequence, table-of-contents style:
          the step numerals carry the visual weight instead of another
          row of icon badges. */}
      <section className="flex flex-col gap-8">
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          How it works
        </h2>
        <ol className="flex flex-col divide-y divide-border border-t border-border">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.title}
              className="animate-fade-up grid grid-cols-[64px_1fr] items-baseline gap-4 py-6 sm:grid-cols-[120px_1fr] sm:gap-8 sm:py-8"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "font-serif text-4xl font-semibold tabular-nums sm:text-6xl",
                  index === HOW_IT_WORKS.length - 1 ? "text-clay-500" : "text-moss-400",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-serif text-lg font-semibold text-ink sm:text-xl">{step.title}</h3>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Why second-hand — one full-bleed editorial statement, the page's
          strongest typographic moment, rather than a boxed callout. A
          single line-drawn book mark (Phase 3) is the only book-object
          language allowed in here — a mark beside the quote, not a photo
          or a card, so the section stays what it already was: typography,
          not another gallery. */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] w-screen bg-paper-muted py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:items-center lg:gap-16">
          <div>
            <BookCoverGlyph className="mb-4 size-8 text-clay-500" />
            <p className="font-serif text-4xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Good books deserve <em className="text-clay-600 not-italic">another reader</em>.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-border/70 lg:border-l lg:border-border/70 lg:pl-10">
            {VALUE_PROPS.map((prop, index) => (
              <li
                key={prop.title}
                className="animate-fade-up flex items-start gap-3 py-4 first:pt-0 lg:first:pt-4 last:pb-0"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <prop.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-clay-600" />
                <div>
                  <p className="text-sm font-semibold text-ink">{prop.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{prop.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

const HERO_ROTATE = ["-rotate-2", "rotate-3", "-rotate-1"];
const HERO_LIFT = ["", "mb-7 sm:mb-8", "mb-2 sm:mb-3"];
const HERO_VISIBLE_FROM = ["", "hidden sm:block", "hidden lg:block"];

/**
 * Phase 3: the hero's right-hand visual, replacing the old vector book-
 * stack illustration with the same conceptual arrangement — a few books
 * set down together, slightly turned, uneven — built from real
 * `BookCover` instances instead of drawn shapes. Reuses the very first
 * items `HomePage`'s own "current arrivals" query already fetched (no
 * second request), and those items are excluded from the grid below, so
 * nothing is shown to a visitor twice on the same page.
 *
 * This is the P0 "real photography, not an illustration" opportunity
 * Phase 0 named — but it never depends on a photograph existing to work:
 * `BookCover` already renders P1A's `NoCoverPlaceholder` when a listing
 * has none, and at this arrangement's scale (a few objects, generous
 * spacing, not a dense grid) a run of placeholders still reads as quiet
 * and considered rather than as Phase 0's "wall of no-cover tiles" —
 * verified directly against the seeded dataset at 0%, 25%, 50%, and 75%
 * cover coverage, not assumed. One item still renders at every width
 * (mobile shows the first; `sm`/`lg` add the second/third) so the mobile
 * hero always closes on an intentional beat instead of Phase 0's empty
 * gap under the CTAs.
 */
function HeroBookArrangement({ items }: { items: ListingPublic[] }): React.JSX.Element {
  return (
    <div className="flex items-end gap-4 sm:gap-5">
      {items.map((listing, index) => (
        <Link
          key={listing.id}
          to={`/listings/${listing.id}`}
          className={cn(
            "group block w-24 shrink-0 animate-fade-up transition-transform duration-300 ease-out hover:-translate-y-1 hover:rotate-0 sm:w-28 lg:w-32",
            HERO_ROTATE[index],
            HERO_LIFT[index],
            HERO_VISIBLE_FROM[index],
          )}
          style={{ animationDelay: `${index * 90}ms` }}
        >
          <BookCover
            size="card"
            interactive
            image={
              listing.images[0]
                ? { url: listing.images[0].url, alt: `${listing.title} by ${listing.author}` }
                : undefined
            }
          />
        </Link>
      ))}
    </div>
  );
}
