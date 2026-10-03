import { cn } from "@/lib/cn";

export type NoCoverSize = "grid" | "thumb" | "stage";

export interface NoCoverPlaceholderProps {
  title: string;
  author: string;
  size?: NoCoverSize;
  /**
   * Whether the "No photo yet" label is exposed to assistive tech here. A
   * caller that already says so in its own text (a listing card announcing
   * it after the title) turns this off, so it isn't read first.
   */
  announce?: boolean;
  className?: string;
}

/**
 * Missing evidence, not an alternative cover.
 *
 * The same field a photo sits on, with a dashed rule where the photo would
 * be, the words "No photo yet", and the listing's own title and author in
 * secondary ink. It is deliberately quieter than any real photograph, so a
 * row of listings never makes the undocumented copy look like the
 * better-presented one.
 *
 * Title and author are drawn as CSS generated content inside an
 * `aria-hidden` box: every caller already renders them as real text beside
 * the tile, so putting them in the DOM twice would make screen readers say
 * them twice and find-in-page match every title twice.
 *
 * - `grid`: the square tile used by every listing grid.
 * - `thumb`: the small ledger/admin square, dashed rule only.
 * - `stage`: the detail page's photo area, a compact 3:2 notice so the
 *   absence of a photo never becomes the largest object on the page.
 */
export function NoCoverPlaceholder({
  title,
  author,
  size = "grid",
  announce = true,
  className,
}: NoCoverPlaceholderProps): React.JSX.Element {
  if (size === "thumb") {
    return (
      <div className={cn("relative aspect-square w-full rounded-xs bg-field", className)}>
        <div className="absolute inset-[8%] border border-dashed border-rule-strong" />
        {announce && <span className="sr-only">No photo yet</span>}
      </div>
    );
  }

  const label = (
    <span
      aria-hidden={announce ? undefined : true}
      className="font-mono text-[11px] font-medium uppercase leading-tight tracking-[0.04em] text-ink-2"
    >
      No photo yet
    </span>
  );

  if (size === "stage") {
    return (
      <div className={cn("relative aspect-[3/2] w-full rounded-xs bg-field", className)}>
        <div className="absolute inset-[6%] flex flex-col gap-4 border border-dashed border-rule-strong p-[6%]">
          {label}
          <p className="max-w-[28ch] text-17 font-medium text-ink-2 sm:text-22 sm:leading-snug">
            The seller hasn&apos;t added a photo of this copy. Judge it by the condition grade and the
            seller&apos;s note.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("@container relative aspect-square w-full rounded-xs bg-field", className)}>
      <div className="absolute inset-[6%] flex flex-col justify-between border border-dashed border-rule-strong p-[9%]">
        {label}
        <span aria-hidden="true" className="flex flex-col gap-[0.35em] text-ink-2">
          <span
            data-text={title}
            className="line-clamp-4 text-[clamp(12px,7cqi,18px)] font-semibold leading-[1.2] [overflow-wrap:anywhere] before:content-[attr(data-text)]"
          />
          <span
            data-text={author}
            className="line-clamp-1 text-[clamp(11px,5.5cqi,14px)] leading-snug before:content-[attr(data-text)]"
          />
        </span>
      </div>
    </div>
  );
}
