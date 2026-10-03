import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, PackageCheck, Trash2 } from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/Badge";
import { BookCover } from "@/components/BookCover";
import { Button } from "@/components/Button";
import { ListingCard } from "@/components/ListingCard";
import { Modal } from "@/components/Modal";
import { getErrorMessage, QueryState } from "@/components/QueryState";
import { ListingDetailSkeleton } from "@/components/Skeleton";
import { useDeleteListing, useListing, useMarkListingSold } from "@/hooks/useListings";
import { cn } from "@/lib/cn";
import { LISTING_GRID_CLASSES } from "@/lib/layout";
import {
  CATEGORY_LABELS,
  CONDITION_DESCRIPTIONS,
  CONDITION_LABELS,
  formatPrice,
  STATUS_LABELS,
  STATUS_TONES,
} from "@/lib/listingLabels";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** FR-005/FR-006a, UC-3/UC-4/UC-5: full detail view, plus owner-only
 * mutating actions (edit/mark-sold/delete) gated on both ownership and
 * status client-side as a UX nicety — the API enforces both regardless
 * (FR-024/FR-028).
 *
 * Laid out as a catalogue entry: the book on the left (sticky on large
 * screens, so it stays in view while the entry is read), and on the right,
 * in order, what a buyer decides on — title, author, price, condition and
 * what that grade means, who is selling it, what can be done next — then
 * the seller's description and the remaining facts. On phones the cover is
 * capped at half the viewport so title, price and condition land on the
 * first screen. */
export function ListingDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state } = useAuth();
  const query = useListing(id ?? "");
  const markSoldMutation = useMarkListingSold(id ?? "");
  const deleteMutation = useDeleteListing(id ?? "");
  const [confirmingSold, setConfirmingSold] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
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
          <article className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <div className="flex flex-col gap-4 lg:sticky lg:top-24">
                <BookCover
                  size="detail"
                  title={listing.title}
                  author={listing.author}
                  category={listing.category}
                  image={
                    listing.images.length > 0
                      ? {
                          url: listing.images[activeImage]?.url ?? listing.images[0].url,
                          alt: `${listing.title} by ${listing.author}`,
                        }
                      : undefined
                  }
                />
                {listing.images.length > 1 && (
                  <div className="flex justify-center gap-2 overflow-x-auto p-1">
                    {listing.images.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setActiveImage(index)}
                        aria-label={`Show image ${index + 1} of ${listing.images.length}`}
                        aria-current={index === activeImage}
                        className={cn(
                          "h-16 w-12 shrink-0 overflow-hidden rounded-xs ring-offset-2 ring-offset-paper transition-[box-shadow,opacity]",
                          index === activeImage ? "ring-2 ring-moss-500" : "opacity-70 hover:opacity-100",
                        )}
                      >
                        <img src={image.url} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col lg:col-span-7">
              {isOwner && (
                <span className="mb-3">
                  <Badge tone={STATUS_TONES[listing.status]} dot>
                    Status: {STATUS_LABELS[listing.status]}
                  </Badge>
                </span>
              )}
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-h1">
                {listing.title}
              </h1>
              <p className="mt-1.5 font-serif text-lg italic text-ink-muted">{listing.author}</p>

              <p className="mt-5 font-serif text-[28px] font-semibold leading-none text-ink lining-nums tabular-nums">
                {formatPrice(listing.price)}
              </p>
              <div className="mt-4">
                <p className="text-base font-medium text-clay-600">
                  <span className="text-ink-muted">Condition: </span>
                  {CONDITION_LABELS[listing.condition]}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{CONDITION_DESCRIPTIONS[listing.condition]}</p>
              </div>

              <section aria-labelledby="seller-heading" className="mt-6 border-t border-border pt-5">
                <h2 id="seller-heading" className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Seller
                </h2>
                <p className="mt-1.5 text-base font-medium text-ink">{listing.seller_display_name}</p>
                {(listing.seller_member_since || typeof listing.seller_active_listings_count === "number") && (
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-ink-muted">
                    {listing.seller_member_since && (
                      <span>
                        Member since{" "}
                        {new Date(listing.seller_member_since).toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    {listing.seller_member_since && typeof listing.seller_active_listings_count === "number" && (
                      <span aria-hidden="true">&middot;</span>
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

              <div className="mt-6">
                {isOwner ? (
                  <div className="flex flex-wrap gap-2">
                    {canEdit && (
                      <Button variant="secondary" onClick={() => navigate(`/listings/${listing.id}/edit`)}>
                        <Pencil aria-hidden="true" className="size-4" />
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
                        <PackageCheck aria-hidden="true" className="size-4" />
                        Mark as sold
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="text-danger-600 hover:bg-danger-50 hover:text-danger-700"
                      onClick={() => {
                        setActionError(null);
                        setConfirmingDelete(true);
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      Delete
                    </Button>
                  </div>
                ) : listing.status === "available" ? (
                  // Honest about what the platform does today: the API has
                  // no seller-contact or checkout capability, so this says
                  // so rather than offering an action that leads nowhere.
                  <p className="rounded-lg bg-paper-muted px-4 py-3 text-sm leading-relaxed text-ink-muted">
                    Punah-Pustak doesn&apos;t handle payments, and messaging sellers through the site isn&apos;t
                    available yet.
                  </p>
                ) : (
                  <p className="rounded-lg bg-paper-muted px-4 py-3 text-sm text-ink-muted">This book has been sold.</p>
                )}
              </div>

              <section aria-labelledby="description-heading" className="mt-8">
                <h2 id="description-heading" className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  About this copy
                </h2>
                <p className="mt-2 max-w-prose whitespace-pre-wrap text-base leading-relaxed text-ink">
                  {listing.description}
                </p>
              </section>

              <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-border pt-5 text-sm">
                <dt className="text-ink-muted">Category</dt>
                <dd className="text-ink">{CATEGORY_LABELS[listing.category]}</dd>
                <dt className="text-ink-muted">Listed</dt>
                <dd className="text-ink">{formatDate(listing.created_at)}</dd>
                {listing.sold_at && (
                  <>
                    <dt className="text-ink-muted">Sold</dt>
                    <dd className="text-ink">{formatDate(listing.sold_at)}</dd>
                  </>
                )}
              </dl>
            </div>
          </article>

          {/* `seller_other_listings` is populated only by this single
              -listing endpoint and already excludes this listing, sold or
              removed listings, and a suspended seller's listings — so the
              only condition here is whether there is anything to show. */}
          {listing.seller_other_listings && listing.seller_other_listings.length > 0 && (
            <section aria-labelledby="more-heading" className="mt-16 border-t border-border pt-8">
              <h2 id="more-heading" className="font-serif text-xl font-semibold text-ink">
                More from {listing.seller_display_name}
              </h2>
              <div className={cn(LISTING_GRID_CLASSES, "mt-6")}>
                {listing.seller_other_listings.map((other) => (
                  <ListingCard key={other.id} listing={other} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Modal isOpen={confirmingSold} onClose={() => setConfirmingSold(false)} title="Mark this listing as sold?">
        <p className="text-sm text-ink-muted">
          It will be removed from public browse results but remain visible on My Listings.
        </p>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger-600">
            {actionError}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmingSold(false)}>
            Cancel
          </Button>
          <Button isLoading={markSoldMutation.isPending} onClick={() => void handleMarkSold()}>
            Mark as sold
          </Button>
        </div>
      </Modal>

      <Modal isOpen={confirmingDelete} onClose={() => setConfirmingDelete(false)} title="Delete this listing?">
        <p className="text-sm text-ink-muted">
          It will no longer appear in public browse or search. This cannot be undone from here.
        </p>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger-600">
            {actionError}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
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
