import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/errors";
import * as usersApi from "@/api/users";
import { PasswordChangeForm } from "@/components/PasswordChangeForm";

vi.mock("@/api/users");

// `{ exact: false }`: both fields are required, so their rendered label is
// "<Label>*" (a sibling `aria-hidden` span), which an exact match misses.
describe("PasswordChangeForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("blocks submission client-side when the new password is under 10 characters (FE-020/SEC-011)", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<PasswordChangeForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Current password", { exact: false }), "correct-horse");
    await user.type(screen.getByLabelText("New password", { exact: false }), "short");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(screen.getByText("Password must be at least 10 characters.")).toBeInTheDocument();
    expect(usersApi.changeOwnPassword).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("submits both passwords to the API and calls onSuccess (FR-031)", async () => {
    vi.mocked(usersApi.changeOwnPassword).mockResolvedValue(undefined);
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<PasswordChangeForm onSuccess={onSuccess} />);

    await user.type(
      screen.getByLabelText("Current password", { exact: false }),
      "correct-horse-battery",
    );
    await user.type(
      screen.getByLabelText("New password", { exact: false }),
      "new-password-long-enough",
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(usersApi.changeOwnPassword).toHaveBeenCalledWith({
      current_password: "correct-horse-battery",
      new_password: "new-password-long-enough",
    });
    await screen.findByRole("button", { name: "Change password" });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("maps a wrong-current-password API error onto the current-password field (FE-021)", async () => {
    vi.mocked(usersApi.changeOwnPassword).mockRejectedValue(
      new ApiError(422, {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed.",
          fields: { current_password: ["Current password is incorrect."] },
        },
      }),
    );
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<PasswordChangeForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Current password", { exact: false }), "wrong-password");
    await user.type(
      screen.getByLabelText("New password", { exact: false }),
      "new-password-long-enough",
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("uses the caller's custom current-password label (e.g. the forced-change flow's 'Temporary password')", () => {
    render(<PasswordChangeForm currentPasswordLabel="Temporary password" onSuccess={vi.fn()} />);

    expect(screen.getByLabelText("Temporary password", { exact: false })).toBeInTheDocument();
  });
});
