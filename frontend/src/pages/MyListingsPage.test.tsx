import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as listingsApi from "@/api/listings";
import { MyListingsPage } from "@/pages/MyListingsPage";
import type { ListingPublic } from "@/api/types";

vi.mock("@/api/listings");

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
    price: "12.50",
    status: "available",
    sold_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    images: [],
    ...overrides,
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyListingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MyListingsPage", () => {
  beforeEach(() => {
    vi.mocked(listingsApi.getMyListings).mockReset();
  });

  it("renders a loading state (not a crash) while the request is pending", () => {
    vi.mocked(listingsApi.getMyListings).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("lists every status with counts, and only offers Edit while a listing is available", async () => {
    vi.mocked(listingsApi.getMyListings).mockResolvedValue([
      makeListing({ id: "a", title: "Still For Sale" }),
      makeListing({ id: "b", title: "Already Sold", status: "sold" }),
      makeListing({ id: "c", title: "Taken Down", status: "deleted" }),
    ]);
    renderPage();

    const forSaleRow = (await screen.findByRole("heading", { name: "Still For Sale" })).closest("li")!;
    expect(within(forSaleRow).getByRole("link", { name: "Edit Still For Sale" })).toHaveAttribute(
      "href",
      "/listings/a/edit",
    );

    const soldRow = screen.getByRole("heading", { name: "Already Sold" }).closest("li")!;
    expect(within(soldRow).getByText("Sold")).toBeInTheDocument();
    expect(within(soldRow).queryByRole("link", { name: /^Edit/ })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "All 3" })).toHaveAttribute("aria-pressed", "true");
  });

  it("narrows the list with the status tabs", async () => {
    vi.mocked(listingsApi.getMyListings).mockResolvedValue([
      makeListing({ id: "a", title: "Still For Sale" }),
      makeListing({ id: "b", title: "Already Sold", status: "sold" }),
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Sold 1" }));

    expect(screen.getByRole("heading", { name: "Already Sold" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Still For Sale" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Removed 0" }));
    expect(screen.getByText("No removed listings.")).toBeInTheDocument();
  });

  it("shows the empty state when the user has no listings", async () => {
    vi.mocked(listingsApi.getMyListings).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("You haven't listed anything yet")).toBeInTheDocument();
  });
});
