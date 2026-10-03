import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * `dialog` (default): a centred confirmation dialog.
   * `sheet`: anchored to the bottom edge at full width on phones (a centred
   * dialog from `sm` up), with a visible close button — for task panels
   * like Browse's mobile filters rather than yes/no confirmations.
   */
  variant?: "dialog" | "sheet";
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * FE-011 shared component, used everywhere FE-040 requires a confirmation
 * step for a destructive action (delete listing, mark sold, admin
 * suspend/remove/reset-password).
 *
 * A11Y-004: traps focus while open and returns it to whatever triggered
 * the modal on close — implemented manually (capture `document.activeElement`
 * on open, restore it on close; a `keydown` handler cycles `Tab`/`Shift+Tab`
 * between the first and last focusable descendants) rather than via the
 * native `<dialog>` element, since `<dialog>`'s imperative
 * `showModal()`/`close()` API doesn't map cleanly onto a declarative
 * `isOpen` prop without its own effect-driven imperative calls anyway —
 * at that point a manual trap is no more code and is fully unit-testable
 * without jsdom's incomplete `<dialog>` support.
 * A11Y-006: `Escape` closes; no keyboard trap escape hatch is lost.
 */
export function Modal({ isOpen, onClose, title, children, variant = "dialog" }: ModalProps): React.JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const focusable = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? container)?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !container) {
        return;
      }
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (nodes.length === 0) {
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center bg-ink/50",
        variant === "sheet" ? "items-end sm:items-center sm:p-4" : "items-center p-4",
      )}
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "w-full max-w-md border border-border bg-paper shadow-overlay focus:outline-none",
          variant === "sheet"
            ? "animate-sheet-in max-h-[85vh] overflow-y-auto rounded-t-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:p-6"
            : "animate-scale-in rounded-xl p-6",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {title}
          </h2>
          {variant === "sheet" && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-paper-muted hover:text-ink"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
