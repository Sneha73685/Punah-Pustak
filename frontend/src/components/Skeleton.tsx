import { LISTING_GRID_CLASSES } from "@/lib/layout";
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

/** Mirrors `ListingCard` line for line — cover slot, title, author, then
 * the price · condition row — with each bar's height equal to the rendered
 * line box it stands in for, so swapping skeleton for content causes no
 * layout shift. The card always reserves two title lines plus the author
 * line, so the skeleton does too. */
export function ListingCardSkeleton(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <Skeleton className="aspect-[2/3] w-full rounded-xs" />
      <div className="flex flex-col pt-3">
        <div className="flex h-[46px] flex-col gap-1.5 py-[3px]">
          <Skeleton className="h-[17px] w-11/12 rounded-sm" />
          <Skeleton className="h-[17px] w-3/5 rounded-sm" />
        </div>
        <Skeleton className="my-[3px] h-[14px] w-1/2 rounded-sm" />
        <Skeleton className="mt-[9px] mb-[3px] h-[18px] w-2/3 rounded-sm" />
      </div>
    </div>
  );
}

export function ListingGridSkeleton({
  count = 8,
  gridClassName = LISTING_GRID_CLASSES,
}: {
  count?: number;
  /** Pass the real grid's classes when it isn't the default listing grid. */
  gridClassName?: string;
}): React.JSX.Element {
  return (
    <div className={gridClassName}>
      {Array.from({ length: count }, (_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}

/** Mirrors `ListingDetailPage`'s catalogue layout: a 2:3 cover (capped
 * like the real one), then title, author, price, condition and the seller
 * block in the same column order. */
export function ListingDetailSkeleton(): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
      <div className="flex justify-center lg:col-span-5">
        <Skeleton className="aspect-[2/3] w-[min(100%,33vh)] rounded-xs lg:w-full lg:max-w-[360px]" />
      </div>
      <div className="lg:col-span-7">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="mt-3 h-6 w-1/3" />
        <Skeleton className="mt-5 h-7 w-24" />
        <Skeleton className="mt-4 h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <div className="mt-6 border-t border-border pt-5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="mt-2.5 h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
      </div>
    </div>
  );
}
