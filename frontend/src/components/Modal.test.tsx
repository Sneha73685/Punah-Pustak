import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "@/components/Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Delete this listing?">
        <p>Are you sure?</p>
      </Modal>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the title and children, focusing the first focusable element, when open", () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Delete this listing?">
        <button type="button">Confirm</button>
      </Modal>,
    );

    expect(screen.getByRole("dialog", { name: "Delete this listing?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus();
  });

  it("calls onClose on Escape (A11Y-006)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Delete this listing?">
        <button type="button">Confirm</button>
      </Modal>,
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop but not when clicking inside the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Delete this listing?">
        <button type="button">Confirm</button>
      </Modal>,
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onClose).not.toHaveBeenCalled();

    // The dialog itself stops propagation; only its backdrop parent closes.
    const backdrop = screen.getByRole("dialog").parentElement;
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus between the first and last focusable descendants (A11Y-004)", async () => {
    const user = userEvent.setup();
    render(
      <Modal isOpen onClose={vi.fn()} title="Delete this listing?">
        <button type="button">Cancel</button>
        <button type="button">Confirm</button>
      </Modal>,
    );

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(cancel).toHaveFocus();

    await user.tab();
    expect(confirm).toHaveFocus();

    await user.tab();
    expect(cancel).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });
});
