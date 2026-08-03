import { useNavigate } from "react-router-dom";

import { Button } from "@/components/Button";
import { ListingCard } from "@/components/ListingCard";
import { QueryState } from "@/components/QueryState";
import { useMyListings } from "@/hooks/useListings";

/** FR-025/FR-026, UC-3: every status the seller owns, including `sold` and
 * `deleted` — unlike public browse, which never shows either (`showStatus`
 * is opted into here for that reason). */
export function MyListingsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const query = useMyListings();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">My listings</h1>
        {/* `navigate()`, not `<Link>` wrapping `<Button>`: a `<button>`
            nested inside an `<a>` is invalid HTML (interactive content
            inside interactive content) and ambiguous for screen readers —
            every other button-triggered navigation in this app (e.g.
            `ListingDetailPage`'s Edit button) already uses this pattern. */}
        <Button onClick={() => navigate("/listings/new")}>Create listing</Button>
      </div>

      <QueryState
        isLoading={query.isPending}
        error={query.error}
        isEmpty={query.data?.length === 0}
        emptyMessage="You haven't listed anything yet."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {query.data?.map((listing) => (
            <ListingCard key={listing.id} listing={listing} showStatus />
          ))}
        </div>
      </QueryState>
    </div>
  );
}
