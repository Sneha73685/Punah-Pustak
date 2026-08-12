import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ListingCard } from "@/components/ListingCard";
import type { ListingPublic } from "@/api/types";

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

function renderCard(props: Partial<Parameters<typeof ListingCard>[0]> = {}): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <ListingCard listing={makeListing()} {...props} />
    </MemoryRouter>,
  );
  return container;
}

/**
 * `ListingCard` was substantially rewritten by the undocumented frontend
 * redesign (48 lines changed) with zero accompanying tests. These cover
 * the behavior that actually matters — what it renders, where it links,
 * and (per the interactive-in-interactive remediation) that it never
 * nests a `<button>` inside its own `<Link>` wrapper.
 */
describe("ListingCard", () => {
  it("renders the listing's title, author, formatted price, and condition", () => {
    renderCard();

    expect(screen.getByText("The Pragmatic Programmer")).toBeInTheDocument();
    expect(screen.getByText("Hunt & Thomas")).toBeInTheDocument();
    expect(screen.getByText("$450.00")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("renders the category and seller display name together", () => {
    renderCard({
      listing: makeListing({ category: "academic_textbook", seller_display_name: "Jordan" }),
    });

    expect(screen.getByText(/Academic textbook/)).toBeInTheDocument();
    expect(screen.getByText(/Jordan/)).toBeInTheDocument();
  });

  it("links to the listing's own detail page", () => {
    renderCard({ listing: makeListing({ id: "target-id" }) });

    expect(screen.getByRole("link")).toHaveAttribute("href", "/listings/target-id");
  });

  it("shows a fallback when the listing has no images, and an <img> with meaningful alt text when it does", () => {
    const { rerender } = render(
      <MemoryRouter>
        <ListingCard listing={makeListing({ images: [] })} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No image")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ListingCard
          listing={makeListing({
            images: [{ id: "img-1", url: "https://example.com/book.jpg", position: 0 }],
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("img", { name: "The Pragmatic Programmer by Hunt & Thomas" })).toHaveAttribute(
      "src",
      "https://example.com/book.jpg",
    );
  });

  it("only shows a status badge when showStatus is true (public browse never shows it, per FR-026)", () => {
    const { rerender } = render(
      <MemoryRouter>
        <ListingCard listing={makeListing({ status: "sold" })} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Sold")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ListingCard listing={makeListing({ status: "sold" })} showStatus />
      </MemoryRouter>,
    );
    expect(screen.getByText("Sold")).toBeInTheDocument();
  });

  it("never nests a <button> inside its <Link> wrapper", () => {
    const container = renderCard();

    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(anchor.querySelector("button")).toBeNull();
    }
  });
});
