import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthShell } from "@/components/AuthShell";

/**
 * `AuthShell` is a new component from the frontend redesign — purely a
 * layout wrapper (brand panel + slot for children), no state, no
 * conditionals beyond responsive CSS classes. Per the instruction not to
 * test CSS classes, this is intentionally a single structural smoke test:
 * the one real behavior worth locking in is that the component actually
 * renders whatever is passed to it as `children`, since `LoginPage` and
 * `RegisterPage` both depend on that to render their forms at all.
 */
describe("AuthShell", () => {
  it("renders its children", () => {
    render(
      <AuthShell>
        <p>Form content goes here</p>
      </AuthShell>,
    );

    expect(screen.getByText("Form content goes here")).toBeInTheDocument();
  });
});
