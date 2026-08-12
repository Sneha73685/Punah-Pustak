import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { Layout } from "@/components/Layout";
import * as usersApi from "@/api/users";
import type { UserPublic } from "@/api/types";

vi.mock("@/api/users");
vi.mock("@/api/client", () => ({
  restoreSession: vi.fn(),
  setPasswordChangeRequiredHandler: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const REGULAR_USER: UserPublic = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "reader@example.com",
  display_name: "Reader",
  role: "user",
  created_at: "2026-01-01T00:00:00Z",
};

const ADMIN_USER: UserPublic = { ...REGULAR_USER, role: "admin" };

/** Every `<a>`/`<Link>` on the page must not have a `<button>` descendant,
 * and vice versa — the general form of the exact bug an undocumented
 * redesign commit reintroduced (`<Link to="/register"><Button>...` in this
 * file) after a prior milestone's own audit had already found and fixed
 * the identical anti-pattern once elsewhere in the app. Applying this to
 * every render of `Layout` (rendered on literally every page, via `App.tsx`'s
 * route tree) is the practical, no-new-dependency stand-in for a project-wide
 * static check: this component is the single highest-leverage place for the
 * assertion to live, since every route renders it.
 */
function expectNoInteractiveNesting(container: HTMLElement): void {
  for (const anchor of container.querySelectorAll("a")) {
    expect(anchor.querySelector("button")).toBeNull();
  }
  for (const button of container.querySelectorAll("button")) {
    expect(button.querySelector("a")).toBeNull();
  }
}

function renderLayout(initialEntry = "/"): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<p>Home content</p>} />
          </Route>
          <Route path="/register" element={<p>Register page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  return container;
}

describe("Layout", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const clientModule = await import("@/api/client");
    vi.mocked(clientModule.restoreSession).mockResolvedValue(null);
  });

  it("never nests a <button> inside an <a>, logged out (desktop + mobile nav closed)", async () => {
    const container = renderLayout();
    await screen.findByRole("button", { name: "Register" });

    expectNoInteractiveNesting(container);
  });

  it('navigates to /register when the nav "Register" button is clicked', async () => {
    renderLayout();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Register" }));

    expect(await screen.findByText("Register page")).toBeInTheDocument();
  });

  it("never nests a <button> inside an <a> once the mobile menu is opened", async () => {
    const container = renderLayout();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expectNoInteractiveNesting(container);
  });

  it("shows the logged-in nav (logout button, no Admin link) for a regular user, with no interactive nesting", async () => {
    const clientModule = await import("@/api/client");
    vi.mocked(clientModule.restoreSession).mockResolvedValue("fake-access-token");
    vi.mocked(usersApi.getOwnProfile).mockResolvedValue(REGULAR_USER);

    const container = renderLayout();

    expect(await screen.findByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin/ })).not.toBeInTheDocument();
    expectNoInteractiveNesting(container);
  });

  it("shows the Admin nav link only for an admin user", async () => {
    const clientModule = await import("@/api/client");
    vi.mocked(clientModule.restoreSession).mockResolvedValue("fake-access-token");
    vi.mocked(usersApi.getOwnProfile).mockResolvedValue(ADMIN_USER);

    renderLayout();

    expect(await screen.findByRole("link", { name: /Admin/ })).toBeInTheDocument();
  });
});
