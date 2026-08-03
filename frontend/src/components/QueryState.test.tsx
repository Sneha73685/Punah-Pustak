import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QueryState } from "@/components/QueryState";
import { ApiError } from "@/api/errors";

describe("QueryState", () => {
  it("shows a loading status while isLoading is true, before checking anything else", () => {
    render(
      <QueryState isLoading error={new Error("should be ignored")}>
        <p>content</p>
      </QueryState>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("shows the ApiError's own message as an alert when given one", () => {
    const error = new ApiError(404, { error: { code: "NOT_FOUND", message: "Listing not found." } });
    render(
      <QueryState isLoading={false} error={error}>
        <p>content</p>
      </QueryState>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Listing not found.");
  });

  it("shows the empty message when isEmpty is true and there is no error", () => {
    render(
      <QueryState isLoading={false} error={null} isEmpty emptyMessage="No listings match your filters.">
        <p>content</p>
      </QueryState>,
    );

    expect(screen.getByText("No listings match your filters.")).toBeInTheDocument();
  });

  it("renders children once loading is done, there is no error, and it isn't empty", () => {
    render(
      <QueryState isLoading={false} error={null}>
        <p>content</p>
      </QueryState>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
