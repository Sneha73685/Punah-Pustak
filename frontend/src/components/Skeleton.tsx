import { LISTING_GRID_CLASSES } from "@/lib/layout";
import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
}

/** FE-011 shared component: one placeholder block on the evidence field,
 * with a slow light sweep (off under reduced motion). Compose several to
 * build a page-specific skeleton rather than each page inventing its own
 * loading shape. */
export function Skeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-xs bg-field",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_ease-in-out_infinite]",
        "before:bg-linear-to-r before:from-transparent before:via-white/40 before:to-transparent motion-reduce:before:hidden",
        className,
      )}
    />
  );
}

/** Mirrors `ListingCard` line for line: square field, the reserved
 * title/author block, then the ruled price line and the seller line, so
 * swapping skeleton for content causes no layout shift. */
export function ListingCardSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-square w-full" />
      <div className="flex flex-col pt-3">
        <div className="flex min-h-[62px] flex-col gap-1.5 sm:min-h-[67px]">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="mt-1 h-3.5 w-1/2" />
        </div>
        <div className="mt-2 flex justify-between border-t border-rule pt-2.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
        </div>
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

/** Mirrors `ListingDetailPage`: the photo stage beside the record column
 * (title, author, price and condition, then the ruled note and seller
 * blocks). */
export function ListingDetailSkeleton(): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-6 pt-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-8 lg:gap-14">
      <Skeleton className="-mx-4 aspect-square sm:mx-0" />
      <div>
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="mt-3 h-5 w-1/3" />
        <Skeleton className="mt-6 h-9 w-28" />
        <Skeleton className="mt-5 h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-2/3" />
        <div className="mt-6 border-t border-rule pt-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-4/5" />
        </div>
      </div>
    </div>
  );
}
