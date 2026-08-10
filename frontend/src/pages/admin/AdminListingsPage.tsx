import { useState } from "react";
import { Link } from "react-router-dom";

import { AdminNav } from "@/components/AdminNav";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getErrorMessage, QueryState } from "@/components/QueryState";
import { Select } from "@/components/Select";
import { useAdminListings, useRemoveListing } from "@/hooks/useAdmin";
import { formatPrice, STATUS_LABELS, STATUS_TONES } from "@/lib/listingLabels";
import type { ListingPublic, ListingStatus } from "@/api/types";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

/** FR-043/FR-042, UC-7: every listing regardless of status, filterable, with
 * the one admin-only mutating action (remove, requiring a reason code). */
export function AdminListingsPage(): React.JSX.Element {
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Listings" description="Review and remove listings across every seller." />
      <AdminNav />

      <div className="max-w-xs">
        <Select
          label="Status"
          placeholder="Any status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ListingStatus | "");
            setPage(1);
          }}
        />
      </div>

      <QueryState isLoading={query.isPending} error={query.error}>
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-paper-muted text-ink-muted">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Seller</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.items.map((listing) => (
                  <tr key={listing.id} className="border-b border-border last:border-0 hover:bg-paper-muted/60">
                    <td className="px-4 py-3">
                      <Link to={`/listings/${listing.id}`} className="font-medium text-moss-600 hover:underline">
                        {listing.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{listing.seller_display_name}</td>
                    <td className="px-4 py-3 text-ink">{formatPrice(listing.price)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[listing.status]}>{STATUS_LABELS[listing.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {listing.status !== "deleted" && (
                        <Button
                          variant="danger"
                          onClick={() => {
                            setActionError(null);
                            setRemoveTarget(listing);
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
          <p role="alert" className="mt-2 text-sm font-medium text-clay-600">
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
