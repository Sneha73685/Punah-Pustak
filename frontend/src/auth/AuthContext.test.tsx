import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ApiError } from "@/api/errors";
import * as usersApi from "@/api/users";

vi.mock("@/api/users");

let capturedPasswordChangeHandler: (() => void) | null = null;

vi.mock("@/api/client", () => ({
  restoreSession: vi.fn().mockResolvedValue("fake-access-token"),
  setPasswordChangeRequiredHandler: vi.fn((handler: (() => void) | null) => {
    capturedPasswordChangeHandler = handler;
  }),
  setSessionExpiredHandler: vi.fn(),
}));

function ProtectedPage(): React.JSX.Element {
  return <p>Protected page content</p>;
}

function ChangePasswordMarker(): React.JSX.Element {
  return <p>Change password page</p>;
}

/** A stand-in for a normal authenticated page that fires some later,
 * unrelated authenticated call — e.g. an admin resets this user's password
 * mid-session (FR-045) and their next click hits a normal endpoint. */
function TriggerMidSessionPasswordChange(): React.JSX.Element {
  const { state } = useAuth();
  return (
    <div>
      <p>Authenticated page, status: {state.status}</p>
      <button
        type="button"
        onClick={() => capturedPasswordChangeHandler?.()}
      >
        Simulate mid-session 403
      </button>
    </div>
  );
}

function renderApp(initialEntry: string): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <ProtectedPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trigger"
            element={
              <ProtectedRoute>
                <TriggerMidSessionPasswordChange />
              </ProtectedRoute>
            }
          />
          <Route path="/change-password" element={<ChangePasswordMarker />} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("FE-022: forced password-change redirect", () => {
  beforeEach(async () => {
    // `clearAllMocks` (not `resetAllMocks`): the latter would wipe the
    // `restoreSession` factory default below too, since it also resets
    // mock *implementations*, not just call history.
    vi.clearAllMocks();
    capturedPasswordChangeHandler = null;
    const clientModule = await import("@/api/client");
    vi.mocked(clientModule.restoreSession).mockResolvedValue("fake-access-token");
  });

  it("redirects a protected route to /change-password when the very first profile fetch after session restore returns 403 PASSWORD_CHANGE_REQUIRED", async () => {
    vi.mocked(usersApi.getOwnProfile).mockRejectedValue(
      new ApiError(403, { error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Must change password." } }),
    );

    renderApp("/protected");

    expect(await screen.findByText("Change password page")).toBeInTheDocument();
    expect(screen.queryByText("Protected page content")).not.toBeInTheDocument();
  });

  it("redirects to /change-password when a 403 PASSWORD_CHANGE_REQUIRED arrives from any later authenticated call, not just at login", async () => {
    vi.mocked(usersApi.getOwnProfile).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      email: "user@example.com",
      display_name: "Test User",
      role: "user",
      created_at: "2026-01-01T00:00:00Z",
    });

    renderApp("/trigger");

    expect(await screen.findByText("Authenticated page, status: authenticated")).toBeInTheDocument();

    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Simulate mid-session 403" }));

    expect(await screen.findByText("Change password page")).toBeInTheDocument();
  });

  it("sends an unauthenticated visitor to /login instead, when session restore finds no valid refresh cookie", async () => {
    const clientModule = await import("@/api/client");
    vi.mocked(clientModule.restoreSession).mockResolvedValue(null);

    renderApp("/protected");

    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });
});
