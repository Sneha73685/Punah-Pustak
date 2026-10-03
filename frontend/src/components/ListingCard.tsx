import { Link } from "react-router-dom";

import { Badge } from "@/components/Badge";
import { BookCover } from "@/components/BookCover";
import { cn } from "@/lib/cn";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  formatPrice,
  STATUS_LABELS,
  STATUS_TONES,
} from "@/lib/listingLabels";
import type { ListingPublic } from "@/api/types";

export interface ListingCardProps {
  listing: ListingPublic;
  /** My Listings shows every status (FR-025); public browse never does
   * (FR-026), so the status badge is opt-in rather than always rendered. */
  showStatus?: boolean;
  /**
   * Off by default (Phase 3 motion pass). This card is mounted fresh
   * every time its result set changes — every keystroke in Browse's
   * search box, every filter, every page of admin/My Listings — which
   * made the entrance replay on nearly every interaction with those
   * views, not just on first arrival. Reach for `true` only on a page
   * where this grid's mount is genuinely a one-time "you've arrived"
   * moment (the homepage) rather than the routine result of browsing.
   */
  animateEntrance?: boolean;
  /** Entrance-animation delay (ms) — set per-card by a grid to stagger the
   * reveal instead of every card animating in unison; ignored unless
   * `animateEntrance` is true. */
  style?: React.CSSProperties;
}

/**
 * Phase 2A: no longer a generic "rounded panel + shadow + badge +
 * thumbnail" ecommerce card — the object (`BookCover`) carries all of the
 * card's depth and its own hover response, so the surrounding card itself
 * has nothing left to be a panel about. Metadata sits directly on the page
 * below it: the price stays the site's oldstyle-serif signature, condition
 * moves from a generic pill to a small-caps label (moss is the site's
 * interactive color, not a metadata color — see `BookCover`'s own doc
 * comment for the object language this reuses on the detail page).
 *
 * FE-051: `alt` text is the listing's title/author — never a filename.
 */
export function ListingCard({
  listing,
  showStatus = false,
  animateEntrance = false,
  style,
}: ListingCardProps): React.JSX.Element {
  const firstImage = listing.images[0];

  return (
    <Link
      to={`/listings/${listing.id}`}
      className={cn("group flex h-full flex-col", animateEntrance && "animate-fade-up")}
      style={animateEntrance ? style : undefined}
    >
      <BookCover
        size="card"
        interactive
        image={firstImage ? { url: firstImage.url, alt: `${listing.title} by ${listing.author}` } : undefined}
        overlay={
          showStatus && (
            <span className="absolute right-2 top-2 z-10">
              <Badge tone={STATUS_TONES[listing.status]} dot className="shadow-card">
                {STATUS_LABELS[listing.status]}
              </Badge>
            </span>
          )
        }
      />
      <div className="flex flex-1 flex-col gap-1 pt-3.5">
        <h3 className="line-clamp-2 font-serif text-base font-semibold leading-snug text-ink transition-colors group-hover:text-moss-700">
          {listing.title}
        </h3>
        <p className="text-sm text-ink-muted">{listing.author}</p>
        <div className="mt-auto flex items-baseline justify-between pt-2">
          <span className="font-serif text-lg font-semibold text-moss-700">{formatPrice(listing.price)}</span>
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-clay-600">
            {CONDITION_LABELS[listing.condition]}
          </span>
        </div>
        <p className="truncate text-xs text-ink-soft">
          {CATEGORY_LABELS[listing.category]} &middot; {listing.seller_display_name}
        </p>
      </div>
    </Link>
  );
}
