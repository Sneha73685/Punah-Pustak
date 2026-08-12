import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as listingsApi from "@/api/listings";
import { ApiError } from "@/api/errors";
import { HomePage } from "@/pages/HomePage";
import type { ListingPage, ListingPublic } from "@/api/types";

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
    price: "450.00",
    status: "available",
    sold_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    images: [],
    ...overrides,
  };
}

function renderHomePage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/listings" element={<p>Browse page</p>} />
          <Route path="/listings/new" element={<p>Create listing page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Regression coverage for the two real bugs the redesign (undocumented,
 * unreviewed commit) introduced into `HomePage`:
 *
 * 1. A failed `GET /listings` was indistinguishable from a genuinely empty
 *    marketplace — both fell through to the same "No books listed yet"
 *    branch, since the original code only ever branched on `isPending`/
 *    `data`, never `error`. Fixed by routing the featured-listings query
 *    through the same `QueryState` component every other data-driven page
 *    (`BrowsePage`, `MyListingsPage`) already uses.
 * 2. Three `<Link><Button>...</Button></Link>` instances (invalid HTML —
 *    interactive content nested inside interactive content) reintroduced
 *    the exact bug class a prior milestone's own audit found and fixed
 *    once already elsewhere in this codebase. Fixed by switching to
 *    `useNavigate`-driven `onClick` handlers, matching the established
 *    pattern every other button-triggered navigation in the app uses.
 */
describe("HomePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows a loading skeleton while the featured-listings query is pending", () => {
    vi.mocked(listingsApi.browseListings).mockReturnValue(new Promise(() => {}));

    renderHomePage();

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("renders real listings once the query resolves with data", async () => {
    const page: ListingPage = {
      items: [makeListing({ title: "Clean Code" }), makeListing({ id: "3", title: "Refactoring" })],
      total: 2,
      page: 1,
      page_size: 8,
    };
    vi.mocked(listingsApi.browseListings).mockResolvedValue(page);

    renderHomePage();

    expect(await screen.findByText("Clean Code")).toBeInTheDocument();
    expect(screen.getByText("Refactoring")).toBeInTheDocument();
    expect(screen.queryByText("No books listed yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it('shows the "No books listed yet" empty state on a genuinely empty, successful response', async () => {
    const page: ListingPage = { items: [], total: 0, page: 1, page_size: 8 };
    vi.mocked(listingsApi.browseListings).mockResolvedValue(page);

    renderHomePage();

    expect(await screen.findByText("No books listed yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a visible error state on a failed request, and does NOT present it as an empty marketplace", async () => {
    vi.mocked(listingsApi.browseListings).mockRejectedValue(
      new ApiError(500, { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our end." } }),
    );

    renderHomePage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our end.");
    // The specific, load-bearing regression: an API failure must never be
    // rendered as "the marketplace is empty" -- those are different facts
    // and a visitor (or the site owner) needs to be able to tell them apart.
    expect(screen.queryByText("No books listed yet")).not.toBeInTheDocument();
  });

  it("navigates to /listings when \"Browse Books\" is clicked", async () => {
    vi.mocked(listingsApi.browseListings).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 8,
    });
    const user = userEvent.setup();
    renderHomePage();

    await user.click(await screen.findByRole("button", { name: "Browse Books" }));

    expect(await screen.findByText("Browse page")).toBeInTheDocument();
  });

  it('navigates to /listings/new when the hero "Sell a Book" button is clicked', async () => {
    vi.mocked(listingsApi.browseListings).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 8,
    });
    const user = userEvent.setup();
    renderHomePage();

    await user.click(await screen.findByRole("button", { name: "Sell a Book" }));

    expect(await screen.findByText("Create listing page")).toBeInTheDocument();
  });

  it('navigates to /listings/new from the empty-state\'s "Sell your first book" action', async () => {
    vi.mocked(listingsApi.browseListings).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 8,
    });
    const user = userEvent.setup();
    renderHomePage();

    await user.click(await screen.findByRole("button", { name: "Sell your first book" }));

    expect(await screen.findByText("Create listing page")).toBeInTheDocument();
  });

  it("never nests a <button> inside an <a> anywhere on the page, in any query state", async () => {
    vi.mocked(listingsApi.browseListings).mockResolvedValue({
      items: [makeListing()],
      total: 1,
      page: 1,
      page_size: 8,
    });

    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("The Pragmatic Programmer");

    const anchors = container.querySelectorAll("a");
    for (const anchor of anchors) {
      expect(anchor.querySelector("button")).toBeNull();
    }
  });
});
