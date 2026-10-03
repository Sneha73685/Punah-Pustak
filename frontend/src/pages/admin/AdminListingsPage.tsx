import { useState } from "react";

import { LG_UP, useMediaQuery } from "@/hooks/useMediaQuery";
import { Link } from "react-router-dom";

import { adminActionClasses, SegmentedFilter, type SegmentedOption } from "@/components/AdminControls";
import { AdminNav } from "@/components/AdminNav";
import { Badge } from "@/components/Badge";
import { ConditionMeter } from "@/components/ConditionMeter";
import { PhotoFrame } from "@/components/PhotoFrame";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getErrorMessage, QueryState } from "@/components/QueryState";
import { useAdminListings, useRemoveListing } from "@/hooks/useAdmin";
import { formatDay, formatPrice, STATUS_LABELS, STATUS_TONES } from "@/lib/listingLabels";
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
  // Nine columns need the full desktop width; tablets get stacked records.
  const isWide = useMediaQuery(LG_UP);
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
      <PhotoFrame
        variant="thumb"
        inactive={listing.status !== "available"}
        title={listing.title}
        author={listing.author}
        image={listing.images[0] ? { url: listing.images[0].url, alt: "" } : undefined}
      />
    );
  }

  function renderTitle(listing: ListingPublic, inline = false): React.JSX.Element {
    const link = (
      <Link to={`/listings/${listing.id}`} className="font-semibold text-ink underline-offset-[3px] hover:underline">
        {listing.title}
      </Link>
    );
    if (inline) {
      // One line in the dense table: title, then author in secondary ink.
      return (
        <p className="truncate">
          {link}
          <span className="text-ink-2"> · {listing.author}</span>
        </p>
      );
    }
    return (
      <div className="min-w-0">
        <p className="[overflow-wrap:anywhere]">{link}</p>
        <span className="block truncate text-13 text-ink-2">{listing.author}</span>
      </div>
    );
  }

  function renderAction(listing: ListingPublic): React.ReactNode {
    if (listing.status === "deleted") {
      return <span className="font-mono text-13 text-ink-2">-</span>;
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
      <PageHeader title="Moderation" description="Every listing, in every status. Each removal is written to the audit log with its reason code." />
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
        {/* Dense table from `lg` up; stacked records on phones and tablets (see
            `AdminUsersPage`). */}
        {isWide ? (
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="text-13 font-bold text-ink">
                {[
                  ["w-11", <span key="p" className="sr-only">Photo</span>],
                  ["", "Copy"],
                  ["", "Seller"],
                  ["text-right", "Price"],
                  ["", "Condition"],
                  ["", "Status"],
                  ["", "Listed"],
                  ["", "ID"],
                  ["text-right", "Action"],
                ].map(([className, label], index) => (
                  <th
                    key={index}
                    className={`sticky top-0 z-10 border-b border-ink bg-ground py-2 pr-3 font-bold ${className as string} ${label === "ID" ? "hidden xl:table-cell" : ""}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((listing) => (
                <tr key={listing.id} className="border-b border-rule">
                  <td className="py-1 pr-3">
                    <div className="w-8">{renderThumb(listing)}</div>
                  </td>
                  <td className="max-w-0 py-1 pr-3 lg:w-[28%] xl:w-[34%]">{renderTitle(listing, true)}</td>
                  <td className="max-w-[11rem] truncate py-1 pr-3 text-ink">{listing.seller_display_name}</td>
                  <td className="tnum whitespace-nowrap py-1 pr-3 text-right font-semibold text-ink">{formatPrice(listing.price)}</td>
                  <td className="py-1 pr-3">
                    <ConditionMeter condition={listing.condition} />
                  </td>
                  <td className="py-1 pr-3">
                    <Badge tone={STATUS_TONES[listing.status]} dot>
                      {STATUS_LABELS[listing.status]}
                    </Badge>
                  </td>
                  <td className="tnum whitespace-nowrap py-1 pr-3 font-mono text-13 text-ink-2">{formatDay(listing.created_at)}</td>
                  <td className="hidden whitespace-nowrap py-1 pr-3 font-mono text-13 text-ink-2 xl:table-cell">{listing.id.slice(0, 8)}</td>
                  <td className="py-1 text-right">{renderAction(listing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="border-t border-ink">
            {query.data?.items.map((listing) => (
              <li key={listing.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-3">
                <div className="w-14">{renderThumb(listing)}</div>
                <div className="min-w-0">
                  {renderTitle(listing)}
                  <dl className="mt-1.5 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[14px]">
                    <dt className="text-ink-2">Seller</dt>
                    <dd className="truncate text-ink">{listing.seller_display_name}</dd>
                    <dt className="text-ink-2">Price</dt>
                    <dd className="tnum font-semibold text-ink">{formatPrice(listing.price)}</dd>
                    <dt className="text-ink-2">Status</dt>
                    <dd>
                      <Badge tone={STATUS_TONES[listing.status]} dot>
                        {STATUS_LABELS[listing.status]}
                      </Badge>
                    </dd>
                    <dt className="text-ink-2">Listed</dt>
                    <dd className="tnum font-mono text-13 text-ink-2">
                      {formatDay(listing.created_at)} · {listing.id.slice(0, 8)}
                    </dd>
                  </dl>
                  <div className="-ml-1 mt-1">{renderAction(listing)}</div>
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
        <p className="text-15 text-ink-2">
          It will no longer appear in public browse or search. The reason code is recorded in the audit log
          (FR-042).
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
          <p role="alert" className="mt-2 text-15 font-medium text-danger">
            {actionError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
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
