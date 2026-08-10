import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, ImageOff, Pencil, PackageCheck, Trash2, User } from "lucide-react";

import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { getErrorMessage, QueryState } from "@/components/QueryState";
import {
  useDeleteListing,
  useListing,
  useMarkListingSold,
} from "@/hooks/useListings";
import { CATEGORY_LABELS, CONDITION_LABELS, formatPrice } from "@/lib/listingLabels";

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
    state.status === "authenticated" && listing !== undefined && state.user.id === listing.owner_id;
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
    <QueryState isLoading={query.isPending} error={query.error}>
      {listing && (
        <article className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          <div className="flex flex-col gap-3 lg:w-2/5 lg:shrink-0">
            {listing.images.length > 0 ? (
              <>
                <div className="aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border bg-paper-muted">
                  <img
                    src={listing.images[activeImage]?.url ?? listing.images[0].url}
                    alt={`${listing.title} by ${listing.author}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                {listing.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {listing.images.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setActiveImage(index)}
                        aria-label={`Show image ${index + 1} of ${listing.images.length}`}
                        aria-current={index === activeImage}
                        className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                          index === activeImage ? "border-moss-500" : "border-transparent"
                        }`}
                      >
                        <img
                          src={image.url}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-paper-muted text-ink-soft">
                <ImageOff aria-hidden="true" className="size-10" />
                <span className="text-sm font-medium">No image available</span>
              </div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge>{CATEGORY_LABELS[listing.category]}</Badge>
              <Badge>{CONDITION_LABELS[listing.condition]}</Badge>
              {isOwner && <Badge tone="neutral">Status: {listing.status}</Badge>}
            </div>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-ink">{listing.title}</h1>
            <p className="mt-1 text-lg text-ink-muted">{listing.author}</p>
            <p className="mt-4 font-serif text-3xl font-semibold text-moss-700">
              {formatPrice(listing.price)}
            </p>

            <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-ink">
              {listing.description}
            </p>

            <Card tone="muted" className="mt-6 flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-white text-moss-500 shadow-card">
                <User aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{listing.seller_display_name}</p>
                <p className="flex items-center gap-1 text-xs text-ink-muted">
                  <CalendarDays aria-hidden="true" className="size-3.5" />
                  Listed on {new Date(listing.created_at).toLocaleDateString()}
                </p>
              </div>
            </Card>

            {isOwner && (
              <div className="mt-6 flex flex-wrap gap-2">
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
                <Link to="/login" className="font-medium text-moss-600 hover:underline">
                  Log in
                </Link>{" "}
                to contact the seller off-platform.
              </p>
            )}
          </div>
        </article>
      )}

      <Modal
        isOpen={confirmingSold}
        onClose={() => setConfirmingSold(false)}
        title="Mark this listing as sold?"
      >
        <p className="text-sm text-ink-muted">
          It will be removed from public browse results but remain visible on My Listings.
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
          <Button isLoading={markSoldMutation.isPending} onClick={() => void handleMarkSold()}>
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
          It will no longer appear in public browse or search. This cannot be undone from here.
        </p>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-clay-600">
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
