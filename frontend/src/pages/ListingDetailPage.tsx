import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  Pencil,
  PackageCheck,
  Trash2,
  User,
} from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/Badge";
import { BookCover } from "@/components/BookCover";
import { Button } from "@/components/Button";
import { ListingCard } from "@/components/ListingCard";
import { Modal } from "@/components/Modal";
import { getErrorMessage, QueryState } from "@/components/QueryState";
import { ListingDetailSkeleton } from "@/components/Skeleton";
import {
  useDeleteListing,
  useListing,
  useMarkListingSold,
} from "@/hooks/useListings";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  formatPrice,
  STATUS_TONES,
} from "@/lib/listingLabels";

/** FR-005/FR-006a, UC-3/UC-4/UC-5: full detail view, plus owner-only
 * mutating actions (edit/mark-sold/delete) gated on both ownership and
 * status client-side as a UX nicety — the API enforces both regardless
 * (FR-024/FR-028), matching §8.3's "the UI does not offer Edit in that
 * state, but the API enforces it regardless of what the client sends." */
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
  // Neither mark-sold nor delete has a field to attach an error to — a
  // plain alert message is the right shape here, not `toFormErrors`. Without
  // this, a real failure (a 409 race with another tab/session, a network
  // error) left the modal stuck open with no visible feedback and an
  // unhandled promise rejection, since `mutateAsync` rejects and neither
  // handler used to catch it.
  const [actionError, setActionError] = useState<string | null>(null);

  const listing = query.data;
  const isOwner =
    state.status === "authenticated" &&
    listing !== undefined &&
    state.user.id === listing.owner_id;
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
    <QueryState
      isLoading={query.isPending}
      error={query.error}
      loadingSkeleton={<ListingDetailSkeleton />}
    >
      {/* No entrance animation on this article (Phase 3 motion pass) —
          browsing from listing to listing is exactly the "routine
          navigation" case that shouldn't replay a reveal on every click;
          the new title/price/photo are already the signal that the page
          changed. */}
      {listing && (
        <>
          <article className="flex flex-col gap-10 lg:flex-row lg:gap-12">
            <div className="flex flex-col gap-3 lg:w-2/5 lg:shrink-0">
              {/* Phase 2A: `BookCover` carries the same P2-A-tuned envelope
                  (aspect-[3/2] below `lg`, aspect-[4/5] at `lg` and up) this
                  page already relied on, so nothing about that mobile fix
                  regresses — only the object treatment inside it changes. */}
              <BookCover
                size="detail"
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
                <div className="flex gap-2 overflow-x-auto">
                  {listing.images.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={`Show image ${index + 1} of ${listing.images.length}`}
                      aria-current={index === activeImage}
                      className={`size-16 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                        index === activeImage
                          ? "border-moss-500 shadow-card"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img src={image.url} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1">
              {isOwner && (
                <Badge tone={STATUS_TONES[listing.status]} dot>
                  Status: {listing.status}
                </Badge>
              )}
              <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {listing.title}
              </h1>
              <p className="mt-1.5 text-lg text-ink-muted">{listing.author}</p>

              {/* Phase 2A ("library catalogue" metadata language): three
                  fields, hairline-ruled, replacing the previous pair of
                  generic pills plus a separate price paragraph. Condition
                  in clay (the "human/editorial" role — a condition is a
                  judgment about how this particular copy was actually
                  used); the gold hairline over Price is the one place gold
                  gets to do its "collectible/special emphasis" job — a
                  mark, not running text, so it costs nothing in contrast. */}
              <dl className="mt-6 grid grid-cols-3 divide-x divide-border border-y border-border">
                <div className="py-3 pr-3 sm:pr-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Category</dt>
                  <dd className="mt-1 text-sm font-medium text-ink">{CATEGORY_LABELS[listing.category]}</dd>
                </div>
                <div className="py-3 px-3 sm:px-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Condition</dt>
                  <dd className="mt-1 text-sm font-medium text-clay-600">{CONDITION_LABELS[listing.condition]}</dd>
                </div>
                <div className="relative py-3 pl-3 sm:pl-4">
                  <span aria-hidden="true" className="absolute inset-x-3 top-0 h-px bg-gold-500 sm:inset-x-4" />
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Price</dt>
                  <dd className="mt-1 font-serif text-xl font-semibold text-moss-700 sm:text-2xl">
                    {formatPrice(listing.price)}
                  </dd>
                </div>
              </dl>

              <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-ink">
                {listing.description}
              </p>

              {/*
              Editorial seller block, not a floating card (Phase 1A's
              material hierarchy): a small field label, a rule, then the
              seller as a person rather than a stats panel. `seller_member_since`/
              `seller_active_listings_count` (Phase 2) are populated only by
              this single-listing detail endpoint — see `ListingPublic`'s
              backend docstring — so they're read defensively (`??`/`typeof`
              guards) even though this page always has them in practice.
              Deliberately still not: ratings, reviews, a "verified seller"
              badge, or any other signal this app doesn't actually have —
              trust here comes from what's honestly shown, not decoration.
            */}
              <div className="mt-8 border-t border-border pt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Seller
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-moss-50 text-moss-600">
                    <User aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {listing.seller_display_name}
                    </p>
                    {listing.seller_member_since && (
                      <p className="text-xs text-ink-muted">
                        Member since{" "}
                        {new Date(
                          listing.seller_member_since,
                        ).toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays aria-hidden="true" className="size-3.5" />
                        Listed this book on{" "}
                        {new Date(listing.created_at).toLocaleDateString()}
                      </span>
                      {typeof listing.seller_active_listings_count ===
                        "number" && (
                        <span className="flex items-center gap-1.5">
                          <BookOpen aria-hidden="true" className="size-3.5" />
                          {listing.seller_active_listings_count} active{" "}
                          {listing.seller_active_listings_count === 1
                            ? "listing"
                            : "listings"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {isOwner && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {canEdit && (
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/listings/${listing.id}/edit`)}
                    >
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
                    variant="danger"
                    onClick={() => {
                      setActionError(null);
                      setConfirmingDelete(true);
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Delete
                  </Button>
                </div>
              )}
              {!isOwner && state.status === "unauthenticated" && (
                <p className="mt-6 text-sm text-ink-muted">
                  <Link
                    to="/login"
                    className="font-medium text-moss-600 hover:underline"
                  >
                    Log in
                  </Link>{" "}
                  to contact the seller off-platform.
                </p>
              )}
            </div>
          </article>

          {/* P1B ("more from this seller"): a restrained extension of the
            seller trust block above, not a "related products" carousel —
            reuses `ListingCard` (and, through it, the no-cover placeholder
            system) rather than a second card pattern. `seller_other_listings`
            is populated only by this single-listing endpoint (see
            `ListingPublic`'s backend docstring, same split as
            `seller_member_since`/`seller_active_listings_count`), already
            excludes this listing itself, sold/deleted listings, and a
            suspended seller's listings — so the only client-side condition
            needed here is "is there anything to show." Renders nothing at
            all when empty: no awkward heading, no empty state. */}
          {listing.seller_other_listings &&
            listing.seller_other_listings.length > 0 && (
              <section className="mt-12 border-t border-border pt-8">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  More from {listing.seller_display_name}
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {listing.seller_other_listings.map((other) => (
                    <ListingCard key={other.id} listing={other} />
                  ))}
                </div>
              </section>
            )}
        </>
      )}

      <Modal
        isOpen={confirmingSold}
        onClose={() => setConfirmingSold(false)}
        title="Mark this listing as sold?"
      >
        <p className="text-sm text-ink-muted">
          It will be removed from public browse results but remain visible on My
          Listings.
        </p>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-clay-600">
            {actionError}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmingSold(false)}>
            Cancel
          </Button>
          <Button
            isLoading={markSoldMutation.isPending}
            onClick={() => void handleMarkSold()}
          >
            Mark as sold
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this listing?"
      >
        <p className="text-sm text-ink-muted">
          It will no longer appear in public browse or search. This cannot be
          undone from here.
        </p>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-clay-600">
            {actionError}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setConfirmingDelete(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={deleteMutation.isPending}
            onClick={() => void handleDelete()}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </QueryState>
  );
}
