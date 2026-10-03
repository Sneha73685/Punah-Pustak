import { Link } from "react-router-dom";

import { Badge } from "@/components/Badge";
import { BookCover } from "@/components/BookCover";
import { CONDITION_LABELS, formatPrice, STATUS_LABELS, STATUS_TONES } from "@/lib/listingLabels";
import type { ListingPublic } from "@/api/types";

export interface ListingCardProps {
  listing: ListingPublic;
  /** Owner/admin contexts only — public browse never shows status (FR-026). */
  showStatus?: boolean;
}

/**
 * A listing as a book on a shelf with a catalogue line beneath it — not a
 * boxed product tile. The cover (`BookCover`) is the only object with
 * depth; everything below it sits directly on the page:
 *
 *   title   — serif, at most two lines
 *   author  — serif italic, one line
 *   price · condition
 *
 * Seller and category live on the detail page and in Browse's filters, not
 * here: on a card they were two extra lines competing with the two facts a
 * shopper actually scans for. Price is ink (information); only the title's
 * hover state uses moss (interaction). Condition is clay, its one role.
 *
 * FE-051: image `alt` is the listing's title/author — never a filename.
 */
export function ListingCard({
  listing,
  showStatus = false,
}: ListingCardProps): React.JSX.Element {
  const firstImage = listing.images[0];
  const isInactive = listing.status !== "available";

  return (
    <Link
      to={`/listings/${listing.id}`}
      className="group flex h-full flex-col"
    >
      <BookCover
        size="card"
        interactive
        inactive={showStatus && isInactive}
        announceNoPhoto={false}
        title={listing.title}
        author={listing.author}
        category={listing.category}
        image={firstImage ? { url: firstImage.url, alt: `${listing.title} by ${listing.author}` } : undefined}
      />
      <div className="flex flex-col pt-3">
        {/* Reserves room for a two-line title plus the author (46 + 20px)
            beneath them, rather than inside the title, so the author always
            sits directly under the title while every price in a grid row
            still lands on the same line. */}
        <div className="min-h-[66px]">
          <h3 className="line-clamp-2 font-serif text-book font-semibold text-ink transition-colors group-hover:text-moss-700">
            {listing.title}
          </h3>
          <p className="truncate font-serif text-sm italic text-ink-muted">{listing.author}</p>
        </div>
        <p className="mt-1.5 flex items-baseline gap-1.5 text-sm">
          <span className="font-serif text-base font-semibold text-ink lining-nums tabular-nums">
            {formatPrice(listing.price)}
          </span>
          <span aria-hidden="true" className="text-ink-soft">
            &middot;
          </span>
          <span className="text-clay-600">
            <span className="sr-only">Condition: </span>
            {CONDITION_LABELS[listing.condition]}
          </span>
          {!firstImage && <span className="sr-only">, no photo</span>}
        </p>
        {showStatus && (
          <span className="mt-2">
            <Badge tone={STATUS_TONES[listing.status]} dot>
              {STATUS_LABELS[listing.status]}
            </Badge>
          </span>
        )}
      </div>
    </Link>
  );
}
