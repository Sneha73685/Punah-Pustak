import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Handshake, Leaf, PlusCircle, Recycle, Search, Wallet } from "lucide-react";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/Input";
import { ListingCard } from "@/components/ListingCard";
import { ListingGridSkeleton } from "@/components/Skeleton";
import { useBrowseListings } from "@/hooks/useListings";

const HOW_IT_WORKS = [
  {
    icon: PlusCircle,
    title: "List it",
    description: "Snap a few photos, describe the book's condition, and set your price.",
  },
  {
    icon: Search,
    title: "Find it",
    description: "Search and filter by title, author, category, condition, or price.",
  },
  {
    icon: Handshake,
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

/** FE-002: the app's real landing page at `/` — distinct from `/listings`
 * (Browse), per the brand direction of a marketplace visitors arrive at
 * before they browse. Renders real data via `useBrowseListings` (FR-001..
 * 004's existing query) rather than any hardcoded "featured" list; an empty
 * database gets a first-visit empty state instead of a blank section. */
export function HomePage(): React.JSX.Element {
  const navigate = useNavigate();
  const [heroSearch, setHeroSearch] = useState("");
  const featuredQuery = useBrowseListings({ page: 1, pageSize: 8 });

  function handleHeroSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = heroSearch.trim();
    navigate(trimmed ? `/listings?search=${encodeURIComponent(trimmed)}` : "/listings");
  }

  return (
    <div className="flex flex-col gap-20 pb-8">
      {/* Hero */}
      <section className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-moss-50 px-3 py-1 text-xs font-medium text-moss-700">
            <BookOpen aria-hidden="true" className="size-3.5" />
            Peer-to-peer &middot; second-hand books
          </span>
          <h1 className="font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Give your books a second story.
          </h1>
          <p className="max-w-md text-base text-ink-muted sm:text-lg">
            Punah-Pustak connects readers who are done with a book to readers who are just
            starting theirs — buy and sell second-hand books directly, without a middleman.
          </p>
          <form
            role="search"
            aria-label="Search books"
            onSubmit={handleHeroSearch}
            className="flex max-w-md flex-col gap-2 sm:flex-row"
          >
            <div className="flex-1">
              <Input
                label="Search books"
                placeholder="Try 'Pragmatic Programmer' or an author"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
              />
            </div>
            <Button type="submit" className="sm:self-end">
              <Search aria-hidden="true" className="size-4" />
              Search
            </Button>
          </form>
          <div className="flex flex-wrap gap-3">
            <Link to="/listings">
              <Button variant="primary">Browse Books</Button>
            </Link>
            <Link to="/listings/new">
              <Button variant="secondary">
                <PlusCircle aria-hidden="true" className="size-4" />
                Sell a Book
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative hidden justify-self-center lg:block" aria-hidden="true">
          <HeroIllustration />
        </div>
      </section>

      {/* Featured / recent listings */}
      <section className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">
              Recently listed
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Fresh finds from sellers on Punah-Pustak.</p>
          </div>
          <Link to="/listings" className="hidden text-sm font-medium text-moss-600 hover:underline sm:inline">
            View all
          </Link>
        </div>

        {featuredQuery.isPending ? (
          <ListingGridSkeleton count={4} />
        ) : featuredQuery.data && featuredQuery.data.items.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featuredQuery.data.items.slice(0, 8).map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No books listed yet"
            description="Punah-Pustak is brand new here — be the first to give a book a second reader."
            action={
              <Link to="/listings/new">
                <Button>
                  <PlusCircle aria-hidden="true" className="size-4" />
                  Sell your first book
                </Button>
              </Link>
            }
          />
        )}
      </section>

      {/* How it works */}
      <section className="flex flex-col gap-8">
        <h2 className="text-center font-serif text-2xl font-semibold text-ink sm:text-3xl">
          How it works
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => (
            <div key={step.title} className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-moss-500 text-white">
                <step.icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="font-serif text-lg font-semibold text-ink">
                {index + 1}. {step.title}
              </h3>
              <p className="max-w-xs text-sm text-ink-muted">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust / value */}
      <section className="rounded-2xl border border-border bg-paper-muted px-6 py-10 sm:px-10">
        <h2 className="font-serif text-2xl font-semibold text-ink sm:text-3xl">
          Why second-hand?
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {VALUE_PROPS.map((prop) => (
            <div key={prop.title} className="flex flex-col gap-2">
              <prop.icon aria-hidden="true" className="size-6 text-clay-500" />
              <h3 className="font-serif text-lg font-semibold text-ink">{prop.title}</h3>
              <p className="text-sm text-ink-muted">{prop.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroIllustration(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 320 260"
      width="320"
      height="260"
      className="max-w-full"
      role="img"
      aria-hidden="true"
    >
      <rect x="20" y="190" width="280" height="14" rx="4" fill="var(--color-paper-strong)" />
      <g transform="translate(60,120) rotate(-6)">
        <rect width="150" height="26" rx="3" fill="var(--color-clay-500)" />
        <rect y="3" width="150" height="4" fill="rgba(255,255,255,0.35)" />
      </g>
      <g transform="translate(70,90) rotate(4)">
        <rect width="160" height="28" rx="3" fill="var(--color-moss-500)" />
        <rect y="3" width="160" height="4" fill="rgba(255,255,255,0.35)" />
      </g>
      <g transform="translate(65,58) rotate(-3)">
        <rect width="155" height="30" rx="3" fill="var(--color-gold-500)" />
        <rect y="3" width="155" height="4" fill="rgba(255,255,255,0.35)" />
      </g>
      <g transform="translate(95,10)">
        <rect width="90" height="46" rx="4" fill="var(--color-ink)" />
        <rect x="6" y="8" width="78" height="4" rx="2" fill="var(--color-paper)" opacity="0.7" />
        <rect x="6" y="18" width="60" height="4" rx="2" fill="var(--color-paper)" opacity="0.5" />
        <rect x="6" y="28" width="66" height="4" rx="2" fill="var(--color-paper)" opacity="0.5" />
      </g>
    </svg>
  );
}
