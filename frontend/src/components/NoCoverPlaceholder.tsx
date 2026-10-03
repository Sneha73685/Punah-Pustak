import { cn } from "@/lib/cn";

/**
 * P1A ("no-cover visual system"): a plain line-drawn book — the shape of a
 * cover carrying only a title and author line, the way an unillustrated
 * literary paperback actually looks — standing in for "this listing has no
 * cover photograph." Deliberately not a broken-image glyph: `currentColor`
 * only, `ink-soft`-toned by the components that use it, so it reads as a
 * quiet, considered absence rather than an error. Exported separately from
 * `NoCoverPlaceholder` below so a caller that needs a functional action
 * icon instead of a passive-fallback caption (see `ImageUploadField`'s own
 * reasoning for NOT using this glyph) could still borrow the mark alone.
 */
export function BookCoverGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 40 52"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="2" width="34" height="48" rx="2.5" fill="currentColor" fillOpacity="0.04" />
      <line x1="11" y1="21" x2="29" y2="21" strokeWidth="2.25" />
      <line x1="14" y1="28" x2="26" y2="28" strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

export interface NoCoverPlaceholderProps {
  className?: string;
  iconClassName?: string;
}

/**
 * The shared "no cover photo" fallback — one visual language reused by
 * `ListingCard` (thumbnail) and `ListingDetailPage` (large detail image),
 * rather than each hand-rolling its own icon+caption. Copy says "no cover
 * photo," never "no image" — this is about a book's cover specifically,
 * and the wording (plus the drawn book mark, plus the calm ink-soft tone)
 * is deliberately never alarming: this states an absence, not an error.
 * No category caption here by design — every caller already shows the
 * listing's category right next to this placeholder (the card's metadata
 * line, the detail page's Badge row), so repeating it here would just be
 * duplicated information, not a new signal.
 */
export function NoCoverPlaceholder({
  className,
  iconClassName,
}: NoCoverPlaceholderProps): React.JSX.Element {
  return (
    <div className={cn("flex h-full w-full flex-col items-center justify-center gap-2 text-ink-soft", className)}>
      <BookCoverGlyph className={cn("size-9", iconClassName)} />
      <span className="text-xs font-medium">No cover photo</span>
    </div>
  );
}
