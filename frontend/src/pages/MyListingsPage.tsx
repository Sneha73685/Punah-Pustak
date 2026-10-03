import { useNavigate } from "react-router-dom";
import { BookOpen, PlusCircle } from "lucide-react";

import { Button } from "@/components/Button";
import { ListingCard } from "@/components/ListingCard";
import { ListingGridSkeleton } from "@/components/Skeleton";
import { PageHeader } from "@/components/PageHeader";
import { QueryState } from "@/components/QueryState";
import { StatStrip } from "@/components/StatStrip";
import { useMyListings } from "@/hooks/useListings";
import { STATUS_LABELS } from "@/lib/listingLabels";
import type { ListingStatus } from "@/api/types";

const SUMMARY_STATUSES: ListingStatus[] = ["available", "sold", "deleted"];

/** FR-025/FR-026, UC-3: every status the seller owns, including `sold` and
 * `deleted` — unlike public browse, which never shows either (`showStatus`
 * is opted into here for that reason). The stat row below is computed
 * client-side from this same already-fetched list, not a separate summary
 * endpoint. */
export function MyListingsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const query = useMyListings();

  const counts = SUMMARY_STATUSES.reduce<Record<ListingStatus, number>>(
    (acc, status) => {
      acc[status] = query.data?.filter((listing) => listing.status === status).length ?? 0;
      return acc;
    },
    { available: 0, sold: 0, deleted: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My listings"
        description="Manage the books you've listed for sale."
        actions={
          <Button onClick={() => navigate("/listings/new")}>
            <PlusCircle aria-hidden="true" className="size-4" />
            Sell a book
          </Button>
        }
      />

      {query.data && query.data.length > 0 && (
        <StatStrip
          items={[
            { label: STATUS_LABELS.available, value: counts.available, tone: "accent" },
            { label: STATUS_LABELS.sold, value: counts.sold },
            { label: STATUS_LABELS.deleted, value: counts.deleted, tone: "muted" },
          ]}
        />
      )}

      <QueryState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.length === 0}
        loadingSkeleton={<ListingGridSkeleton count={4} />}
        emptyState={{
          icon: BookOpen,
          title: "You haven't listed anything yet",
          description: "List your first book and start reaching other readers on Punah-Pustak.",
          action: (
            <Button onClick={() => navigate("/listings/new")}>
              <PlusCircle aria-hidden="true" className="size-4" />
              Sell a book
            </Button>
          ),
        }}
      >
        {/* No entrance animation here (Phase 3 motion pass) — a seller
            managing their own listings revisits this page routinely; see
            `ListingCard`'s own doc comment. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {query.data?.map((listing) => (
            <ListingCard key={listing.id} listing={listing} showStatus />
          ))}
        </div>
      </QueryState>
    </div>
  );
}
