import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as adminApi from "@/api/admin";
import { ApiError } from "@/api/errors";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage";
import type { AdminUserPage } from "@/api/types";

vi.mock("@/api/admin");

const USER_LIST: AdminUserPage = {
  items: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      email: "target@example.com",
      display_name: "Target User",
      created_at: "2026-01-01T00:00:00Z",
      is_active: true,
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
};

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Regression coverage for a real bug caught in this milestone's final
 * audit: `handleSuspend`/`handleReinstate`/`handleResetPassword` called
 * `mutateAsync` with no `try`/`catch` at all, so a rejected mutation (e.g.
 * a 403 from the backend's admin-target restriction — an admin attempting
 * to suspend a *fellow* admin, since `AdminUserPublic` carries no `role`
 * to warn against it beforehand) left the confirmation modal stuck open
 * with no visible error, and an unhandled promise rejection besides.
 */
describe("AdminUsersPage — suspend error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(adminApi.listUsers).mockResolvedValue(USER_LIST);
  });

  it("shows the API error and keeps the modal open when suspending fails (e.g. the target is an admin)", async () => {
    vi.mocked(adminApi.suspendUser).mockRejectedValue(
      new ApiError(403, {
        error: { code: "FORBIDDEN", message: "Cannot suspend another admin account." },
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog", { name: /Suspend target@example.com/ });
    await user.type(within(dialog).getByLabelText("Reason code", { exact: false }), "abuse");
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));

    // The error surfaces in two places by design (the modal itself, and a
    // page-level banner for actions with no modal, like reinstate) — scope
    // to the dialog to avoid an ambiguous double-match.
    expect(
      await within(dialog).findByText("Cannot suspend another admin account."),
    ).toBeInTheDocument();
    // Still open: the "Cancel" button (only present while the modal is up)
    // is still there, proving `setSuspendTarget(null)` never ran.
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("closes the modal and shows no error when suspending succeeds", async () => {
    vi.mocked(adminApi.suspendUser).mockResolvedValue({
      ...USER_LIST.items[0],
      is_active: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog", { name: /Suspend target@example.com/ });
    await user.type(within(dialog).getByLabelText("Reason code", { exact: false }), "abuse");
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));

    await screen.findByRole("button", { name: "Reset password" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Cannot suspend another admin account.")).not.toBeInTheDocument();
  });
});
