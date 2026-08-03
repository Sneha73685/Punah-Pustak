import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_LISTING_FORM_VALUES, ListingForm } from "@/components/ListingForm";

// `{ exact: false }` throughout: every required field's rendered label is
// "<Label>*" (the `*` is a sibling `aria-hidden` span, not a separate
// element RTL's label-text matching ignores), so an exact match on just the
// label text never matches.
async function fillValidForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText("Title", { exact: false }), "The Pragmatic Programmer");
  await user.type(screen.getByLabelText("Author", { exact: false }), "Hunt & Thomas");
  await user.type(screen.getByLabelText("Description", { exact: false }), "Barely used.");
  await user.selectOptions(screen.getByLabelText("Category", { exact: false }), "non_fiction");
  await user.selectOptions(screen.getByLabelText("Condition", { exact: false }), "good");
  await user.type(screen.getByLabelText("Price", { exact: false }), "25.50");
}

describe("ListingForm", () => {
  it("blocks submission and shows an error for each missing required field (FE-020)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ListingForm
        initialValues={EMPTY_LISTING_FORM_VALUES}
        onSubmit={onSubmit}
        submitLabel="Create listing"
        isSubmitting={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create listing" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText("Author is required.")).toBeInTheDocument();
    expect(screen.getByText("Description is required.")).toBeInTheDocument();
    expect(screen.getByText("Category is required.")).toBeInTheDocument();
    expect(screen.getByText("Condition is required.")).toBeInTheDocument();
    expect(screen.getByText("Price must be greater than 0.")).toBeInTheDocument();
  });

  it("rejects a zero or negative price even when every other field is valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ListingForm
        initialValues={EMPTY_LISTING_FORM_VALUES}
        onSubmit={onSubmit}
        submitLabel="Create listing"
        isSubmitting={false}
      />,
    );

    await user.type(screen.getByLabelText("Title", { exact: false }), "Title");
    await user.type(screen.getByLabelText("Author", { exact: false }), "Author");
    await user.type(screen.getByLabelText("Description", { exact: false }), "Description");
    await user.selectOptions(screen.getByLabelText("Category", { exact: false }), "fiction");
    await user.selectOptions(screen.getByLabelText("Condition", { exact: false }), "new");
    await user.type(screen.getByLabelText("Price", { exact: false }), "0");
    await user.click(screen.getByRole("button", { name: "Create listing" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Price must be greater than 0.")).toBeInTheDocument();
  });

  it("calls onSubmit with parsed, typed values once every field is valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ListingForm
        initialValues={EMPTY_LISTING_FORM_VALUES}
        onSubmit={onSubmit}
        submitLabel="Create listing"
        isSubmitting={false}
      />,
    );

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create listing" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "The Pragmatic Programmer",
      author: "Hunt & Thomas",
      description: "Barely used.",
      category: "non_fiction",
      condition: "good",
      price: 25.5,
    });
  });

  it("surfaces server-side field errors (FE-021) alongside client validation", () => {
    render(
      <ListingForm
        initialValues={EMPTY_LISTING_FORM_VALUES}
        onSubmit={vi.fn()}
        submitLabel="Create listing"
        isSubmitting={false}
        serverFieldErrors={{ title: "That title is already in use." }}
      />,
    );

    expect(screen.getByText("That title is already in use.")).toBeInTheDocument();
  });
});
