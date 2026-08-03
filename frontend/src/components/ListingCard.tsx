import { Link } from "react-router-dom";

import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { CATEGORY_LABELS, formatPrice, STATUS_LABELS, STATUS_TONES } from "@/lib/listingLabels";
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
    <Card className="flex flex-col gap-2">
      <Link to={`/listings/${listing.id}`} className="flex flex-col gap-2">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-md bg-slate-100">
          {firstImage ? (
            <img
              src={firstImage.url}
              alt={`${listing.title} by ${listing.author}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              No image
            </div>
          )}
        </div>
        <h3 className="font-semibold text-slate-900">{listing.title}</h3>
        <p className="text-sm text-slate-600">{listing.author}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{formatPrice(listing.price)}</span>
          <Badge>{CATEGORY_LABELS[listing.category]}</Badge>
          {showStatus && (
            <Badge tone={STATUS_TONES[listing.status]}>{STATUS_LABELS[listing.status]}</Badge>
          )}
        </div>
      </Link>
    </Card>
  );
}
