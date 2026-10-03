import { Link } from "react-router-dom";

import { ConditionMeter } from "@/components/ConditionMeter";
import { PhotoFrame } from "@/components/PhotoFrame";
import { cn } from "@/lib/cn";
import { formatPrice, isSubstantiveNote, STATUS_LABELS } from "@/lib/listingLabels";
import type { ListingPublic } from "@/api/types";

export interface ListingCardProps {
  listing: ListingPublic;
  /** Owner/admin contexts only. Public browse never shows status (FR-026). */
  showStatus?: boolean;
  /** Off where the seller is already named above ("More from Meera"). */
  showSeller?: boolean;
  /** Quote the seller's note on wide screens when it says something. */
  showNote?: boolean;
  /** `compact` is the smaller type used in rails of six. */
  density?: "regular" | "compact";
}

/**
 * A listing as a catalogue record, not a product card: no box, no shadow,
 * no lift. The photo field is the only surface; everything else sits on
 * the page in the order a buyer evaluates a used copy:
 *
 *   photo (evidence)
 *   title, author                 (what book)
 *   price            ●●●○○ Good   (what it costs, what state it's in)
 *   from <seller>                 (who is passing it on)
 *   "seller's note"               (what they said, in ballpoint)
 *
 * The title/author block always reserves two title lines plus the author
 * line, so every price rule in a grid row lands on the same line.
 * Hover darkens the field and underlines the title; nothing moves.
 *
 * FE-051: image `alt` is the listing's title/author, never a filename.
 */
export function ListingCard({
  listing,
  showStatus = false,
  showSeller = true,
  showNote = true,
  density = "regular",
}: ListingCardProps): React.JSX.Element {
  const firstImage = listing.images[0];
  const isInactive = listing.status !== "available";
  const note = listing.description.trim();
  const compact = density === "compact";

  return (
    <Link to={`/listings/${listing.id}`} className="group relative flex min-w-0 flex-col focus-visible:outline-offset-4">
      <PhotoFrame
        variant="grid"
        inactive={showStatus && isInactive}
        announceNoPhoto={false}
        title={listing.title}
        author={listing.author}
        image={firstImage ? { url: firstImage.url, alt: `${listing.title} by ${listing.author}` } : undefined}
      />
      <div className="flex flex-col pt-3">
        <div className={compact ? "min-h-[63px]" : "min-h-[62px] sm:min-h-[67px]"}>
          <h3
            className={cn(
              "line-clamp-2 font-semibold leading-[1.3] text-ink [overflow-wrap:anywhere] decoration-1 underline-offset-[3px] group-hover:underline",
              compact ? "text-15" : "text-15 sm:text-[16px]",
            )}
          >
            {listing.title}
          </h3>
          <p className="truncate text-13 text-ink-2 sm:text-[14px]">{listing.author}</p>
        </div>
        <p className="mt-2 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 border-t border-rule pt-2">
          <span className={cn("font-bold tracking-[-0.01em] text-ink", compact ? "text-15 sm:text-[16px]" : "text-[16px] sm:text-[18px]")}>
            {formatPrice(listing.price)}
          </span>
          <ConditionMeter condition={listing.condition} />
        </p>
        {!firstImage && <span className="sr-only">, no photo yet</span>}
        {(showSeller || listing.images.length > 1) && (
          <p className="mt-1.5 flex items-baseline justify-between gap-3 text-[12px] text-ink-2 sm:text-13">
            <span className="truncate">{showSeller && `from ${listing.seller_display_name}`}</span>
            {listing.images.length > 1 && (
              <span className="shrink-0 font-mono text-[11px] sm:text-[12px]">{listing.images.length} photos</span>
            )}
          </p>
        )}
        {showNote && isSubstantiveNote(note) && (
          <p className="mt-1.5 hidden border-l-2 border-ballpoint pl-2.5 text-[14px] italic leading-snug text-ballpoint xl:line-clamp-2">
            &ldquo;{note}&rdquo;
          </p>
        )}
        {showStatus && isInactive && (
          <p className="mt-1.5 font-mono text-13 text-ink-2">{STATUS_LABELS[listing.status]}</p>
        )}
      </div>
    </Link>
  );
}
