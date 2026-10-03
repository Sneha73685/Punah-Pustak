import { useState } from "react";

import { MD_UP, useMediaQuery } from "@/hooks/useMediaQuery";
import { Link } from "react-router-dom";

import { adminActionClasses, SegmentedFilter, type SegmentedOption } from "@/components/AdminControls";
import { AdminNav } from "@/components/AdminNav";
import { Badge } from "@/components/Badge";
import { BookCover } from "@/components/BookCover";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getErrorMessage, QueryState } from "@/components/QueryState";
import { useAdminListings, useRemoveListing } from "@/hooks/useAdmin";
import { formatPrice, STATUS_LABELS, STATUS_TONES } from "@/lib/listingLabels";
import type { ListingPublic, ListingStatus } from "@/api/types";

const PAGE_SIZE = 20;

const STATUS_FILTER_OPTIONS: SegmentedOption<ListingStatus | "all">[] = [
  { value: "all", label: "All" },
  { value: "available", label: STATUS_LABELS.available },
  { value: "sold", label: STATUS_LABELS.sold },
  { value: "deleted", label: STATUS_LABELS.deleted },
];

/** FR-043/FR-042, UC-7: every listing regardless of status, filterable, with
 * the one admin-only mutating action (remove, requiring a reason code). */
export function AdminListingsPage(): React.JSX.Element {
  const isWide = useMediaQuery(MD_UP);
  const [status, setStatus] = useState<ListingStatus | "">("");
  const [page, setPage] = useState(1);
  const query = useAdminListings({ status: status || undefined, page, pageSize: PAGE_SIZE });
  const removeMutation = useRemoveListing();

  const [removeTarget, setRemoveTarget] = useState<ListingPublic | null>(null);
  const [reasonCode, setReasonCode] = useState("");
  // See `AdminUsersPage`'s identical `actionError` for why: without this,
  // a real failure (e.g. a 409 race — another admin already removed the
  // same listing) left the modal stuck open with no feedback and an
  // unhandled promise rejection.
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleRemove(): Promise<void> {
    if (!removeTarget) return;
    setActionError(null);
    try {
      await removeMutation.mutateAsync({ listingId: removeTarget.id, reasonCode });
      setRemoveTarget(null);
      setReasonCode("");
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function renderThumb(listing: ListingPublic): React.JSX.Element {
    return (
      <BookCover
        size="thumb"
        inactive={listing.status !== "available"}
        title={listing.title}
        author={listing.author}
        category={listing.category}
        image={listing.images[0] ? { url: listing.images[0].url, alt: "" } : undefined}
      />
    );
  }

  function renderTitle(listing: ListingPublic): React.JSX.Element {
    return (
      <Link
        to={`/listings/${listing.id}`}
        className="font-medium text-ink underline-offset-4 hover:text-moss-700 hover:underline"
      >
        {listing.title}
      </Link>
    );
  }

  function renderAction(listing: ListingPublic): React.ReactNode {
    if (listing.status === "deleted") {
      return null;
    }
    return (
      <button
        type="button"
        className={adminActionClasses()}
        onClick={() => {
          setActionError(null);
          setRemoveTarget(listing);
        }}
      >
        Remove
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Listings" description="Review and remove listings across every seller." />
      <AdminNav />

      <SegmentedFilter
        label="Filter by status"
        options={STATUS_FILTER_OPTIONS}
        value={status || "all"}
        onChange={(next) => {
          setStatus(next === "all" ? "" : next);
          setPage(1);
        }}
      />

      <QueryState isLoading={query.isPending} error={query.error}>
        {/* Dense table from `md` up; label/value cards on phones (see
            `AdminUsersPage`). */}
        {isWide ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-strong text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <th className="w-12 px-3 py-2 font-semibold">
                  <span className="sr-only">Cover</span>
                </th>
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="px-3 py-2 font-semibold">Seller</th>
                <th className="px-3 py-2 text-right font-semibold">Price</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((listing) => (
                <tr key={listing.id} className="border-b border-border transition-colors hover:bg-paper-muted/60">
                  <td className="px-3 py-1.5">
                    <div className="w-6">{renderThumb(listing)}</div>
                  </td>
                  <td className="px-3 py-1.5">{renderTitle(listing)}</td>
                  <td className="px-3 py-1.5 text-ink">{listing.seller_display_name}</td>
                  <td className="px-3 py-1.5 text-right text-ink lining-nums tabular-nums">{formatPrice(listing.price)}</td>
                  <td className="px-3 py-1.5">
                    <Badge tone={STATUS_TONES[listing.status]} dot>
                      {STATUS_LABELS[listing.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right">{renderAction(listing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {query.data?.items.map((listing) => (
              <li key={listing.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 py-3">
                <div className="w-10">{renderThumb(listing)}</div>
                <div className="min-w-0">
                  {renderTitle(listing)}
                  <dl className="mt-1 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
                    <dt className="text-ink-muted">Seller</dt>
                    <dd className="text-ink">{listing.seller_display_name}</dd>
                    <dt className="text-ink-muted">Price</dt>
                    <dd className="text-ink lining-nums tabular-nums">{formatPrice(listing.price)}</dd>
                    <dt className="text-ink-muted">Status</dt>
                    <dd>
                      <Badge tone={STATUS_TONES[listing.status]} dot>
                        {STATUS_LABELS[listing.status]}
                      </Badge>
                    </dd>
                  </dl>
                  <div className="-ml-2 mt-1">{renderAction(listing)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {query.data && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={setPage} />
        )}
      </QueryState>

      <Modal
        isOpen={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title={`Remove "${removeTarget?.title ?? ""}"?`}
      >
        <p className="text-sm text-ink-muted">
          It will no longer appear in public browse or search. This requires a reason code for the
          audit log (FR-042).
        </p>
        <div className="mt-4">
          <Input
            label="Reason code"
            required
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
          />
        </div>
        {actionError && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger-600">
            {actionError}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!reasonCode.trim()}
            isLoading={removeMutation.isPending}
            onClick={() => void handleRemove()}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}
