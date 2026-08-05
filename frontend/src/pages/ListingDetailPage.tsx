import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
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
        <article className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            {listing.images.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {listing.images.map((image) => (
                  <img
                    key={image.id}
                    src={image.url}
                    alt={`${listing.title} by ${listing.author}`}
                    className="aspect-square w-full rounded-md object-cover"
                  />
                ))}
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-md bg-slate-100 text-sm text-slate-600">
                No images
              </div>
            )}
          </div>

          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-900">{listing.title}</h1>
            <p className="text-slate-600">{listing.author}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900">
              {formatPrice(listing.price)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{CATEGORY_LABELS[listing.category]}</Badge>
              <Badge>{CONDITION_LABELS[listing.condition]}</Badge>
              {isOwner && <Badge tone="neutral">Status: {listing.status}</Badge>}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-slate-800">{listing.description}</p>
            <p className="mt-4 text-sm text-slate-500">
              Listed by {listing.seller_display_name} on{" "}
              {new Date(listing.created_at).toLocaleDateString()}
            </p>

            {isOwner && (
              <div className="mt-6 flex flex-wrap gap-2">
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
                  variant="danger"
                  onClick={() => {
                    setActionError(null);
                    setConfirmingDelete(true);
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
            {!isOwner && state.status === "unauthenticated" && (
              <p className="mt-6 text-sm text-slate-500">
                <Link to="/login" className="font-medium text-blue-700 hover:underline">
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
        <p className="text-sm text-slate-600">
          It will be removed from public browse results but remain visible on My Listings.
        </p>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-red-700">
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
        <p className="text-sm text-slate-600">
          It will no longer appear in public browse or search. This cannot be undone from here.
        </p>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-red-700">
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
