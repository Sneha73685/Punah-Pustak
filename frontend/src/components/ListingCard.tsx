import { ImageOff } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
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
}

/** FE-051: `alt` text is the listing's title/author — never a filename. */
export function ListingCard({ listing, showStatus = false }: ListingCardProps): React.JSX.Element {
  const firstImage = listing.images[0];

  return (
    <Card interactive padding="none" className="flex flex-col overflow-hidden">
      <Link to={`/listings/${listing.id}`} className="group flex flex-1 flex-col">
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-paper-muted">
          {firstImage ? (
            <img
              src={firstImage.url}
              alt={`${listing.title} by ${listing.author}`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-soft">
              <ImageOff aria-hidden="true" className="size-8" />
              <span className="text-xs font-medium">No image</span>
            </div>
          )}
          {showStatus && (
            <span className="absolute right-2 top-2">
              <Badge tone={STATUS_TONES[listing.status]}>{STATUS_LABELS[listing.status]}</Badge>
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="line-clamp-2 font-serif text-base font-semibold leading-snug text-ink">
            {listing.title}
          </h3>
          <p className="text-sm text-ink-muted">{listing.author}</p>
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="font-serif text-lg font-semibold text-moss-700">
              {formatPrice(listing.price)}
            </span>
            <Badge>{CONDITION_LABELS[listing.condition]}</Badge>
          </div>
          <p className="truncate text-xs text-ink-soft">
            {CATEGORY_LABELS[listing.category]} &middot; {listing.seller_display_name}
          </p>
        </div>
      </Link>
    </Card>
  );
}
