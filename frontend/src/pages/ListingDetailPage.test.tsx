import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as listingsApi from "@/api/listings";
import { AuthProvider } from "@/auth/AuthContext";
import { ListingDetailPage } from "@/pages/ListingDetailPage";
import type { ListingPublic } from "@/api/types";

vi.mock("@/api/listings");
vi.mock("@/api/client", () => ({
  restoreSession: vi.fn(),
  setPasswordChangeRequiredHandler: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

/**
 * Phase 2 ("seller trust presentation"): `seller_member_since`/
 * `seller_active_listings_count` are populated only by `GET /listings/{id}`
 * (see `ListingPublic`'s backend docstring) — these tests cover that this
 * page renders them correctly, including the zero-count edge case, without
 * regressing the rest of the detail view.
 */
function makeListing(overrides: Partial<ListingPublic> = {}): ListingPublic {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    owner_id: "22222222-2222-2222-2222-222222222222",
    seller_display_name: "A Reader",
    title: "The Pragmatic Programmer",
    author: "Hunt & Thomas",
    description: "Well-loved copy.",
    category: "non_fiction",
    condition: "good",
    price: "450.00",
    status: "available",
    sold_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    images: [],
    seller_member_since: "2025-03-14T00:00:00Z",
    seller_active_listings_count: 3,
    seller_other_listings: null,
    ...overrides,
  };
}

function makeOtherListing(overrides: Partial<ListingPublic> = {}): ListingPublic {
  return makeListing({
    id: "33333333-3333-3333-3333-333333333333",
    title: "Another Book",
    author: "Someone Else",
    price: "12.00",
    ...overrides,
  });
}

function renderDetailPage(listingId = "11111111-1111-1111-1111-111111111111"): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/listings/${listingId}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/listings/:id" element={<ListingDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ListingDetailPage seller metadata", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const clientModule = await import("@/api/client");
    vi.mocked(clientModule.restoreSession).mockResolvedValue(null);
  });

  it("renders the seller's member-since month/year and active listing count", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({ seller_member_since: "2025-03-14T00:00:00Z", seller_active_listings_count: 3 }),
    );

    renderDetailPage();

    expect(await screen.findByText("Member since March 2025")).toBeInTheDocument();
    expect(screen.getByText("3 active listings")).toBeInTheDocument();
  });

  it("uses singular \"listing\" for a count of exactly one", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({ seller_active_listings_count: 1 }),
    );

    renderDetailPage();

    expect(await screen.findByText("1 active listing")).toBeInTheDocument();
  });

  it('shows "0 active listings" rather than hiding the line when the seller has none', async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({ seller_active_listings_count: 0 }),
    );

    renderDetailPage();

    await screen.findByText("The Pragmatic Programmer");
    expect(screen.getByText("0 active listings")).toBeInTheDocument();
  });

  it("does not render member-since or the listing count when the backend omits them", async () => {
    // Defensive path: every OTHER `ListingPublic`-returning endpoint leaves
    // these `null` by design (see the schema's own docstring) — this page
    // must degrade gracefully rather than rendering "null" or crashing if
    // it were ever handed a listing shaped that way.
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({ seller_member_since: null, seller_active_listings_count: null }),
    );

    renderDetailPage();

    await screen.findByText("The Pragmatic Programmer");
    expect(screen.queryByText(/Member since/)).not.toBeInTheDocument();
    expect(screen.queryByText(/active listing/)).not.toBeInTheDocument();
  });

  it("still renders the book's own title, author, price, and description", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(makeListing());

    renderDetailPage();

    expect(await screen.findByText("The Pragmatic Programmer")).toBeInTheDocument();
    expect(screen.getByText("Hunt & Thomas")).toBeInTheDocument();
    expect(screen.getByText("$450.00")).toBeInTheDocument();
    expect(screen.getByText("Well-loved copy.")).toBeInTheDocument();
    expect(screen.getByText("A Reader")).toBeInTheDocument();
  });
});

/**
 * P1B ("more from this seller"): `seller_other_listings`, populated only by
 * `GET /listings/{id}` (see `ListingPublic`'s backend docstring) — the
 * backend already excludes the anchor listing, sold/deleted listings, and a
 * suspended seller's listings, so this page's own job is only "render
 * whatever's there, or nothing at all."
 */
describe("ListingDetailPage more-from-this-seller section", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const clientModule = await import("@/api/client");
    vi.mocked(clientModule.restoreSession).mockResolvedValue(null);
  });

  it("renders a card for each of the seller's other available listings", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({
        seller_display_name: "Jordan",
        seller_other_listings: [
          makeOtherListing({ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "First Other" }),
          makeOtherListing({ id: "aaaaaaaa-0000-0000-0000-000000000002", title: "Second Other" }),
        ],
      }),
    );

    renderDetailPage();

    expect(await screen.findByText("More from Jordan")).toBeInTheDocument();
    expect(screen.getByText("First Other")).toBeInTheDocument();
    expect(screen.getByText("Second Other")).toBeInTheDocument();
  });

  it("never shows the anchor listing's own title inside the section", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({
        title: "The Pragmatic Programmer",
        seller_other_listings: [
          makeOtherListing({ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "Genuinely Other" }),
        ],
      }),
    );

    renderDetailPage();

    await screen.findByText("More from A Reader");
    // The anchor's own title still appears once, as the page's own <h1> —
    // this only guards against it being duplicated a second time inside
    // the "more from this seller" grid.
    expect(screen.getAllByText("The Pragmatic Programmer")).toHaveLength(1);
  });

  it("renders exactly one card without padding to a grid, when there is only one other listing", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({
        seller_other_listings: [
          makeOtherListing({ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "Only Other" }),
        ],
      }),
    );

    renderDetailPage();

    await screen.findByText("Only Other");
    expect(screen.getAllByRole("link", { name: /Only Other/ })).toHaveLength(1);
  });

  it("renders the no-cover placeholder for an other-listing with no images", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({
        // Gives the anchor listing itself a real image, so the only
        // "No photo" placeholder on the page is the one this test
        // is actually asserting on — the other-listing card's own.
        images: [{ id: "img-1", url: "https://example.com/book.jpg", position: 0 }],
        seller_other_listings: [
          makeOtherListing({
            id: "aaaaaaaa-0000-0000-0000-000000000001",
            title: "Coverless Other",
            images: [],
          }),
        ],
      }),
    );

    renderDetailPage();

    await screen.findByText("Coverless Other");
    expect(screen.getByText("No photo")).toBeInTheDocument();
  });

  it("renders nothing when the seller has no other available listings (empty list)", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({ seller_other_listings: [] }),
    );

    renderDetailPage();

    await screen.findByText("The Pragmatic Programmer");
    expect(screen.queryByText(/More from/)).not.toBeInTheDocument();
  });

  it("renders nothing when the backend omits the field (null)", async () => {
    vi.mocked(listingsApi.getListing).mockResolvedValue(
      makeListing({ seller_other_listings: null }),
    );

    renderDetailPage();

    await screen.findByText("The Pragmatic Programmer");
    expect(screen.queryByText(/More from/)).not.toBeInTheDocument();
  });

  it("does not render the section while the listing is still loading", () => {
    vi.mocked(listingsApi.getListing).mockReturnValue(new Promise(() => {}));

    renderDetailPage();

    expect(screen.queryByText(/More from/)).not.toBeInTheDocument();
  });
});

/**
 * P2-A (live performance measurement): Lighthouse measured a 0.727 CLS on
 * this page — `QueryState`'s default "Loading…" fallback (a single short
 * line) let the footer sit far above where the real, much taller article
 * ends up, so it jumped ~1500px once the query resolved. Fixed by passing
 * a page-shaped `loadingSkeleton` (see `ListingDetailSkeleton` in
 * `Skeleton.tsx`) — this test locks in that the loading state renders a
 * skeleton region rather than silently reverting to the plain-text
 * fallback in a future edit.
 */
describe("ListingDetailPage loading state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows a page-shaped loading skeleton while the listing query is pending", () => {
    vi.mocked(listingsApi.getListing).mockReturnValue(new Promise(() => {}));

    renderDetailPage();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});
