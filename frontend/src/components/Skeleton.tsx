import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
}

/** FE-011 shared component: a single pulsing placeholder block. Compose
 * several to build a page-specific skeleton (see `ListingCardSkeleton`
 * below) rather than each page inventing its own loading shape. */
export function Skeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-lg bg-paper-strong",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.2s_ease-in-out_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent motion-reduce:before:hidden",
        className,
      )}
    />
  );
}

/**
 * Phase 4A: mirrors the *current* `ListingCard` — a bare link wrapping a
 * `BookCover`-shaped object, not the bordered white panel Phase 2A removed.
 * This used to reproduce the pre-2A card (`rounded-2xl border bg-white p-4
 * shadow-card`), which meant every loading grid on the site briefly showed
 * a component shape that no longer exists anywhere once the real cards
 * replace it. No shadow or page-edge here on purpose — `BookCover`'s own
 * doc comment explains why that treatment is gated on a real image
 * existing, and a skeleton is exactly the "nothing to show yet" case that
 * reasoning already covers; reproducing it would make the loading state
 * look like a fake book rather than a quiet placeholder.
 *
 * Structure and spacing below intentionally reuse `ListingCard`'s own
 * classes verbatim (`flex h-full flex-col`; the meta block's `flex flex-1
 * flex-col gap-1 pt-3.5`; the price row's `mt-auto ... pt-2`) rather than
 * hand-tuned approximations, so the two stay in sync by construction. Bar
 * heights were taken from the real rendered card, not guessed (measured:
 * title 22px, author 20px, price/condition row 36px, category line 16px —
 * summing with the shared `gap-1`/`pt-3.5` to the same ~472px total the
 * loaded card renders at).
 */
export function ListingCardSkeleton(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <Skeleton className="aspect-[3/4] w-full" />
      <div className="flex flex-1 flex-col gap-1 pt-3.5">
        <Skeleton className="h-[22px] w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <div className="mt-auto flex items-baseline justify-between pt-2">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3.5 w-12" />
        </div>
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function ListingGridSkeleton({ count = 8 }: { count?: number }): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}

/**
 * P2-A (live performance measurement): `ListingDetailPage` had no
 * `loadingSkeleton`, so `QueryState` fell back to a single short "Loading…"
 * line — Lighthouse measured a 0.727 CLS on that page (the footer jumping
 * ~1500px once the real, much taller article replaced it). Mirrors the
 * real page's two-column shape (image column + category pills/title/price
 * /description/seller-block) closely enough that the footer no longer
 * jumps by more than a normal amount — not a pixel-exact match, since the
 * real description's line count and whether "more from this seller"
 * exists can't be known before the data arrives.
 */
export function ListingDetailSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
      <div className="lg:w-2/5 lg:shrink-0">
        <Skeleton className="aspect-[3/2] w-full lg:aspect-[4/5]" />
      </div>
      <div className="flex-1">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-9 w-3/4" />
        <Skeleton className="mt-2 h-5 w-1/3" />
        <Skeleton className="mt-5 h-8 w-24" />
        <div className="mt-6 flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="mt-8 border-t border-border pt-6">
          <Skeleton className="h-3 w-16" />
          <div className="mt-3 flex items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
