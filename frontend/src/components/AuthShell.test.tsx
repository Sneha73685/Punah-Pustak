import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthShell } from "@/components/AuthShell";

vi.mock("@/api/listings", () => ({ browseListings: () => new Promise(() => {}) }));

/**
 * `AuthShell` is a layout wrapper (an optional row of real covers + a slot
 * for children). Per the instruction not to
 * test CSS classes, this is intentionally a single structural smoke test:
 * the one real behavior worth locking in is that the component actually
 * renders whatever is passed to it as `children`, since `LoginPage` and
 * `RegisterPage` both depend on that to render their forms at all.
 */
describe("AuthShell", () => {
  it("renders its children", () => {
    // AuthShell reads the newest listings for its optional cover row, so it
    // needs a query client; the (mocked) request never resolves here, which is
    // exactly the "no covers yet" state.
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthShell>
          <p>Form content goes here</p>
        </AuthShell>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Form content goes here")).toBeInTheDocument();
  });
});
