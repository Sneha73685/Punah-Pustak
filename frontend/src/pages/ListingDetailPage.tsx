import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { ConditionMeter } from "@/components/ConditionMeter";
import { ListingCard } from "@/components/ListingCard";
import { Modal } from "@/components/Modal";
import { PhotoFrame } from "@/components/PhotoFrame";
import { getErrorMessage, QueryState } from "@/components/QueryState";
import { ListingDetailSkeleton } from "@/components/Skeleton";
import { useDeleteListing, useListing, useMarkListingSold } from "@/hooks/useListings";
import { MD_UP, useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/cn";
import { RAIL_CLASSES } from "@/lib/layout";
import {
  CATEGORY_LABELS,
  CONDITION_DESCRIPTIONS,
  formatDay,
  formatMonth,
  formatPrice,
  STATUS_LABELS,
} from "@/lib/listingLabels";
import type { ListingImagePublic, ListingPublic } from "@/api/types";

/** Titles longer than this step down a size so price and condition stay
 * near the top of the record column. Nothing is truncated. */
const LONG_TITLE = 80;

/** FR-005/FR-006a, UC-3/UC-4/UC-5: full detail view, plus owner-only
 * mutating actions (edit/mark-sold/delete) gated on both ownership and
 * status client-side as a UX nicety; the API enforces both regardless
 * (FR-024/FR-028).
 *
 * Laid out as an inspection of one physical copy: the seller's photos on
 * the left as evidence, and beside them a sticky record in the order a
 * buyer decides: title, author, price, condition and what that grade
 * means, the seller's own note, who is passing it on, and what the site
 * does and doesn't do. Then the record line, and the seller's other copies.
 * On phones the photos come first as a swipeable strip, and title, price
 * and condition land on the first screen. */
export function ListingDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state } = useAuth();
  const query = useListing(id ?? "");
  const markSoldMutation = useMarkListingSold(id ?? "");
  const deleteMutation = useDeleteListing(id ?? "");
  const [confirmingSold, setConfirmingSold] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const listing = query.data;
  const isOwner = state.status === "authenticated" && listing !== undefined && state.user.id === listing.owner_id;
  const canEdit = isOwner && listing?.status === "available";

  async function handleMarkSold(): Promise<void> {
    setActionError(null);
    try {
      await markSoldMutation.mutateAsync();
      setConfirmingSold(false);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  async function handleDelete(): Promise<void> {
    setActionError(null);
    try {
      await deleteMutation.mutateAsync();
      setConfirmingDelete(false);
      navigate("/my-listings");
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  return (
    <QueryState isLoading={query.isPending} error={query.error} loadingSkeleton={<ListingDetailSkeleton />}>
      {listing && (
        <>
          <p className="hidden pb-5 pt-5 font-mono text-13 text-ink-2 md:block">
            <Link to="/listings" className="underline underline-offset-2 hover:text-ink">
              Browse
            </Link>
            {" / "}
            <Link to={`/listings?category=${listing.category}`} className="underline underline-offset-2 hover:text-ink">
              {CATEGORY_LABELS[listing.category]}
            </Link>
          </p>

          <article className="grid grid-cols-1 items-start gap-x-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-14">
            <Photos listing={listing} />

            <div className="pt-4 md:sticky md:top-6 md:pt-0">
              {isOwner ? (
                <p className="mb-5 border-y border-ink py-2.5 text-15 font-semibold text-ink">
                  Status: {STATUS_LABELS[listing.status]}
                  {listing.status === "sold" && listing.sold_at && <> · {formatDay(listing.sold_at)}</>}
                </p>
              ) : (
                listing.status === "sold" && (
                  <p className="mb-5 border-y border-ink py-2.5 text-15 font-semibold text-ink">
                    This copy has been sold{listing.sold_at && <> on {formatDay(listing.sold_at)}</>}.
                  </p>
                )
              )}

              <h1
                className={cn(
                  "font-bold text-ink [overflow-wrap:anywhere]",
                  listing.title.length > LONG_TITLE
                    ? "text-[21px] leading-[1.2] tracking-[-0.015em] sm:text-[26px]"
                    : "text-[26px] leading-[1.1] tracking-[-0.025em] md:text-[30px] lg:text-[36px]",
                )}
              >
                {listing.title}
              </h1>
              <p className="mt-1 text-[16px] text-ink-2 sm:mt-2 sm:text-[18px]">{listing.author}</p>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:mt-6 md:block">
                {listing.status === "available" ? (
                  <p className="text-[28px] font-extrabold leading-none tracking-[-0.02em] text-ink lg:text-[36px]">
                    {formatPrice(listing.price)}
                  </p>
                ) : (
                  <p className="text-15 text-ink-2">
                    Listed at <span className="text-22 font-semibold">{formatPrice(listing.price)}</span>
                  </p>
                )}
                <ConditionMeter condition={listing.condition} size="lg" className="md:mt-5" />
              </div>
              <p className="mt-2 max-w-[46ch] text-15 text-ink-2">{CONDITION_DESCRIPTIONS[listing.condition]}</p>

              <section aria-labelledby="note-heading" className="mt-6 border-t border-rule pt-4">
                <h2 id="note-heading" className="text-13 font-bold text-ink">
                  Seller&apos;s note
                </h2>
                <p className="mt-1.5 max-w-[52ch] whitespace-pre-wrap border-l-2 border-ballpoint pl-3 text-17 italic leading-relaxed text-ballpoint sm:text-[19px]">
                  {listing.description}
                </p>
              </section>

              <section aria-labelledby="seller-heading" className="mt-6 border-t border-rule pt-4">
                <h2 id="seller-heading" className="text-13 font-bold text-ink">
                  Passed on by
                </h2>
                <p className="mt-1 text-[18px] font-semibold text-ink">{listing.seller_display_name}</p>
                {(listing.seller_member_since || typeof listing.seller_active_listings_count === "number") && (
                  <p className="tnum mt-0.5 flex flex-wrap gap-x-2 font-mono text-13 text-ink-2">
                    {listing.seller_member_since && <span>Member since {formatMonth(listing.seller_member_since)}</span>}
                    {listing.seller_member_since && typeof listing.seller_active_listings_count === "number" && (
                      <span aria-hidden="true">·</span>
                    )}
                    {typeof listing.seller_active_listings_count === "number" && (
                      <span>
                        {listing.seller_active_listings_count} active{" "}
                        {listing.seller_active_listings_count === 1 ? "listing" : "listings"}
                      </span>
                    )}
                  </p>
                )}
              </section>

              <div className="mt-6 border-t border-rule pt-4">
                {isOwner ? (
                  <div className="flex flex-wrap gap-2">
                    {canEdit && (
                      <Button variant="secondary" onClick={() => navigate(`/listings/${listing.id}/edit`)}>
                        Edit
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActionError(null);
                          setConfirmingSold(true);
                        }}
                      >
                        Mark as sold
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="text-danger hover:bg-transparent hover:underline hover:underline-offset-4"
                      onClick={() => {
                        setActionError(null);
                        setConfirmingDelete(true);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                ) : (
                  // Honest about what the platform does today: the API has
                  // no seller-contact or checkout capability, so this says
                  // so rather than offering an action that leads nowhere.
                  <p className="max-w-[52ch] text-15 text-ink-2">
                    Punah-Pustak doesn&apos;t connect buyers and sellers yet. There&apos;s no messaging or checkout on
                    the site.
                  </p>
                )}
              </div>

              <p className="tnum mt-6 border-t border-rule pt-4 font-mono text-13 text-ink-2">
                Listed {formatDay(listing.created_at)} · {CATEGORY_LABELS[listing.category]} ·{" "}
                {listing.images.length === 0
                  ? "no photo"
                  : `${listing.images.length} ${listing.images.length === 1 ? "photo" : "photos"}`}
              </p>
            </div>
          </article>

          {/* `seller_other_listings` is populated only by this single
              -listing endpoint and already excludes this listing, sold or
              removed listings, and a suspended seller's listings, so the
              only condition here is whether there is anything to show. */}
          {listing.seller_other_listings && listing.seller_other_listings.length > 0 && (
            <section aria-labelledby="more-heading" className="mt-14 sm:mt-20">
              <div className="mb-5 flex flex-wrap items-baseline gap-x-4 border-t border-ink pt-3.5 sm:mb-6">
                <h2 id="more-heading" className="text-[19px] font-bold tracking-[-0.015em] text-ink sm:text-22">
                  More from {listing.seller_display_name}
                </h2>
                <span className="tnum font-mono text-13 text-ink-2">
                  {listing.seller_other_listings.length}{" "}
                  {listing.seller_other_listings.length === 1 ? "other copy" : "other copies"}
                </span>
              </div>
              <div className={RAIL_CLASSES}>
                {listing.seller_other_listings.map((other) => (
                  <div key={other.id}>
                    <ListingCard listing={other} showSeller={false} showNote={false} density="compact" />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Modal isOpen={confirmingSold} onClose={() => setConfirmingSold(false)} title="Mark this listing as sold?">
        <p className="text-15 text-ink-2">It will be removed from public browse results but remain visible on My Listings.</p>
        {actionError && (
          <p role="alert" className="mt-2 text-15 font-medium text-danger">
            {actionError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmingSold(false)}>
            Cancel
          </Button>
          <Button isLoading={markSoldMutation.isPending} onClick={() => void handleMarkSold()}>
            Mark as sold
          </Button>
        </div>
      </Modal>

      <Modal isOpen={confirmingDelete} onClose={() => setConfirmingDelete(false)} title="Delete this listing?">
        <p className="text-15 text-ink-2">It will no longer appear in public browse or search. This cannot be undone from here.</p>
        {actionError && (
          <p role="alert" className="mt-2 text-15 font-medium text-danger">
            {actionError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" isLoading={deleteMutation.isPending} onClick={() => void handleDelete()}>
            Delete
          </Button>
        </div>
      </Modal>
    </QueryState>
  );
}

function photoAlt(listing: ListingPublic, index: number): string {
  return `${listing.title} by ${listing.author}, seller's photo ${index + 1} of ${listing.images.length}`;
}

/**
 * The evidence. From 768px: the selected photo large in a field that takes
 * its shape, the full set beneath it as a contact strip at true
 * proportions, and the photo opens full-size in a lightbox. On phones: one
 * square field per photo in a horizontal, snapping strip with a "1 / 4"
 * counter. Only one of the two is ever in the DOM.
 */
function Photos({ listing }: { listing: ListingPublic }): React.JSX.Element {
  const isWide = useMediaQuery(MD_UP);
  const [active, setActive] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const images = listing.images;
  const count = images.length;

  if (count === 0) {
    return (
      <div className="-mx-4 sm:mx-0">
        <PhotoFrame variant="stage" title={listing.title} author={listing.author} />
      </div>
    );
  }

  const current = images[Math.min(active, count - 1)];

  return (
    <div>
      {isWide ? (
        <>
          <button
            type="button"
            onClick={() => setLightboxIndex(active)}
            aria-label={`Enlarge photo ${active + 1} of ${count}`}
            className="group block w-full cursor-zoom-in"
          >
            <PhotoFrame
              key={current.id}
              variant="stage"
              title={listing.title}
              author={listing.author}
              image={{ url: current.url, alt: photoAlt(listing, active) }}
            />
          </button>
          <p className="tnum mt-2 flex justify-between font-mono text-13 text-ink-2">
            <span>
              Photo {active + 1} of {count}
            </span>
            <button type="button" onClick={() => setLightboxIndex(active)} className="underline underline-offset-2 hover:text-ink">
              Enlarge
            </button>
          </p>
          {count > 1 && <ContactStrip images={images} active={active} onSelect={setActive} />}
        </>
      ) : (
        <SwipeStrip listing={listing} onOpen={setLightboxIndex} />
      )}

      {lightboxIndex !== null && (
        <Lightbox listing={listing} index={lightboxIndex} onIndexChange={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}

function ContactStrip({
  images,
  active,
  onSelect,
}: {
  images: ListingImagePublic[];
  active: number;
  onSelect: (index: number) => void;
}): React.JSX.Element {
  return (
    <ul className="mt-6 flex flex-wrap items-end gap-4" aria-label="All photos">
      {images.map((image, index) => (
        <li key={image.id}>
          <button
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Show photo ${index + 1} of ${images.length}`}
            aria-current={index === active}
            className="group flex flex-col gap-1.5 text-left"
          >
            <span
              className={cn(
                "block h-24 rounded-xs bg-field p-2 transition-colors group-hover:bg-field-hover",
                index === active && "bg-field-hover shadow-[inset_0_-3px_0_var(--color-ballpoint)]",
              )}
            >
              <img src={image.url} alt="" className="h-full w-auto" />
            </span>
            <span className="tnum font-mono text-13 text-ink-2">{String(index + 1).padStart(2, "0")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SwipeStrip({ listing, onOpen }: { listing: ListingPublic; onOpen: (index: number) => void }): React.JSX.Element {
  const stripRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const count = listing.images.length;

  // The counter follows the strip's own scroll position (not the window's).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    function handleScroll(): void {
      if (strip && strip.clientWidth > 0) {
        setCurrent(Math.round(strip.scrollLeft / strip.clientWidth));
      }
    }
    strip.addEventListener("scroll", handleScroll, { passive: true });
    return () => strip.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div>
      <div
        ref={stripRef}
        role="region"
        aria-label={count > 1 ? "Seller's photos, scroll sideways for more" : "Seller's photo"}
        tabIndex={count > 1 ? 0 : undefined}
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto sm:-mx-6"
      >
        {listing.images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`Enlarge photo ${index + 1} of ${count}`}
            className="w-full shrink-0 snap-start"
          >
            <PhotoFrame
              variant="grid"
              className="rounded-none"
              title={listing.title}
              author={listing.author}
              image={{ url: image.url, alt: photoAlt(listing, index) }}
            />
          </button>
        ))}
      </div>
      <p className="tnum mt-2 flex justify-between font-mono text-13 text-ink-2">
        <span aria-live="polite">
          {Math.min(current + 1, count)} / {count}
        </span>
        <span aria-hidden="true">{count > 1 ? "swipe for more" : "tap to enlarge"}</span>
      </p>
    </div>
  );
}

function Lightbox({
  listing,
  index,
  onIndexChange,
  onClose,
}: {
  listing: ListingPublic;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}): React.JSX.Element {
  const count = listing.images.length;
  const image = listing.images[index];
  const previous = (): void => onIndexChange((index - 1 + count) % count);
  const next = (): void => onIndexChange((index + 1) % count);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (count < 2) return;
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + count) % count);
      if (event.key === "ArrowRight") onIndexChange((index + 1) % count);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [count, index, onIndexChange]);

  return (
    <Modal isOpen variant="lightbox" onClose={onClose} title={`${listing.title}, photo ${index + 1} of ${count}`}>
      <div className="relative min-h-0 flex-1 px-2 sm:px-6">
        <img key={image.id} src={image.url} alt={photoAlt(listing, index)} className="animate-photo-in h-full w-full object-contain" />
      </div>
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 font-mono text-13 sm:px-6">
        {count > 1 ? (
          <>
            <button type="button" onClick={previous} className="inline-flex min-h-11 items-center px-1 underline-offset-4 hover:underline focus-visible:outline-ground">
              Previous
            </button>
            <span className="tnum">
              {index + 1} / {count}
            </span>
            <button type="button" onClick={next} className="inline-flex min-h-11 items-center px-1 underline-offset-4 hover:underline focus-visible:outline-ground">
              Next
            </button>
          </>
        ) : (
          <span>1 / 1</span>
        )}
      </div>
    </Modal>
  );
}
