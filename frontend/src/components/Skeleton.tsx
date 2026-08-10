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
      className={cn("animate-pulse rounded-lg bg-paper-strong", className)}
    />
  );
}

/** Mirrors `ListingCard`'s layout so the browse/my-listings grid doesn't
 * jump when real cards replace the skeleton. */
export function ListingCardSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-card">
      <Skeleton className="aspect-[3/4] w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
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
