import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * `dialog` (default): a centred confirmation dialog.
   * `sheet`: anchored to the bottom edge at full width on phones (a centred
   * dialog from `sm` up), with a visible Close button, for task panels
   * like Browse's phone filters rather than yes/no confirmations.
   * `lightbox`: the whole viewport in ink, for looking at a seller's photo
   * at full size; the title becomes the top caption line.
   */
  variant?: "dialog" | "sheet" | "lightbox";
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * FE-011 shared component, used everywhere FE-040 requires a confirmation
 * step for a destructive action (delete listing, mark sold, admin
 * suspend/remove/reset-password), for Browse's phone filter sheet, and for
 * the listing photo lightbox.
 *
 * A11Y-004: traps focus while open and returns it to whatever triggered
 * the modal on close, implemented manually (capture `document.activeElement`
 * on open, restore it on close; a `keydown` handler cycles `Tab`/`Shift+Tab`
 * between the first and last focusable descendants) rather than via the
 * native `<dialog>` element, whose imperative API doesn't map cleanly onto
 * a declarative `isOpen` prop and isn't fully supported by jsdom.
 * A11Y-006: `Escape` closes.
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

  if (variant === "lightbox") {
    return (
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed inset-0 z-50 flex flex-col bg-ink text-ground focus:outline-none"
      >
        <div className="flex min-h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <h2 id={titleId} className="truncate font-mono text-13">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center px-1 text-15 font-semibold underline-offset-4 hover:underline focus-visible:outline-ground"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center bg-ink/45",
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
          "w-full max-w-md border-t-2 border-ink bg-ground focus:outline-none",
          variant === "sheet"
            ? "animate-sheet-in max-h-[88vh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6"
            : "animate-scale-in px-6 pb-6",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-ink">
          <h2 id={titleId} className="py-3 text-17 font-bold text-ink">
            {title}
          </h2>
          {variant === "sheet" && (
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 inline-flex min-h-11 shrink-0 items-center px-1 text-15 font-semibold text-ballpoint underline underline-offset-4"
            >
              Close
            </button>
          )}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
