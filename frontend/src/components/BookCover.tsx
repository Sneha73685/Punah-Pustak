import { NoCoverPlaceholder } from "@/components/NoCoverPlaceholder";
import { cn } from "@/lib/cn";

export interface BookCoverImage {
  url: string;
  alt: string;
}

export interface BookCoverProps {
  /** Omit to render P1A's `NoCoverPlaceholder` instead. */
  image?: BookCoverImage;
  /** `"card"` for the repeated grid object; `"detail"` for the single,
   * larger presentation on the listing page. Controls scale only — both
   * render the same physical-object language. */
  size?: "card" | "detail";
  /** Hover/focus lift — on for `ListingCard`, off for the static detail
   * presentation (which isn't itself a link, and never uses the intrinsic
   * sizing path below, so there's nothing for `interactive` to affect there). */
  interactive?: boolean;
  /** Rendered above the stage, e.g. `ListingCard`'s owner-only status pill. */
  overlay?: React.ReactNode;
  className?: string;
}

type Size = NonNullable<BookCoverProps["size"]>;

const STAGE_RADIUS: Record<Size, string> = {
  card: "rounded-md",
  detail: "rounded-lg",
};

const IMAGE_PADDING: Record<Size, string> = {
  card: "p-2.5",
  detail: "p-6 sm:p-8",
};

const EDGE_WIDTH: Record<Size, string> = {
  card: "w-3",
  detail: "w-4",
};

/** The page-block edge + light-catching hairline, identical wherever a real
 * image renders — factored out so the two stage strategies below (fixed
 * envelope vs. intrinsic sizing) share one definition rather than two
 * hand-kept copies. */
function PageEdge({ size }: { size: Size }): React.JSX.Element {
  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-ink/25 via-ink/[0.07] to-transparent",
          EDGE_WIDTH[size],
        )}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[3px] w-px bg-white/50" />
    </>
  );
}

/**
 * Phase 2A: the "book as object" abstraction — one place, reused by
 * `ListingCard` and `ListingDetailPage`'s primary image, so a real cover
 * photo reads as a physical thing that was placed on the page rather than a
 * generic ecommerce thumbnail, and so that reading never has to be
 * hand-duplicated at each call site.
 *
 * A real photo is never force-cropped. Both are gated on `image` being
 * present — an unlit shadow or a page-edge under an empty placeholder would
 * quietly imply an object that isn't there, which is exactly what P1A's
 * no-cover state is not supposed to do. The no-cover stage instead gets a
 * plain dashed border, matching the same "intentional, not broken" language
 * already used elsewhere for absence (`EmptyState`).
 *
 * Phase 2B fix: a *photographed* `"detail"` image no longer sits inside a
 * fixed-aspect envelope. It used to (`aspect-[3/2] lg:aspect-[4/5]`, tuned
 * for the no-cover placeholder's own footprint — see the fixed-envelope
 * branch below, still used for that case) — but `object-contain` inside a
 * box whose *orientation* doesn't match the photo's own (a landscape 3:2
 * frame under a portrait paperback, at exactly the width this app runs at
 * on a phone) starves the image down to a fraction of the frame and leaves
 * the rest as dead paper-muted margin: physically-motivated depth cues
 * framing empty space instead of a book. A real photo now sizes the frame
 * around itself instead — full width, natural height, capped at `70vh` so
 * an unusually tall photograph still can't take over the screen (the same
 * concern that motivated the old fixed ratio in the first place). The
 * no-cover placeholder keeps the original fixed envelope untouched, since
 * there's no photo to be honest to and it still needs to match
 * `ListingDetailSkeleton`'s own assumed shape.
 */
export function BookCover({
  image,
  size = "card",
  interactive = false,
  overlay,
  className,
}: BookCoverProps): React.JSX.Element {
  const hasImage = Boolean(image);
  const intrinsic = size === "detail" && hasImage;

  return (
    <div className={cn("relative", className)}>
      {intrinsic ? (
        <div
          className={cn(
            "relative flex w-full items-center justify-center overflow-hidden bg-paper-muted shadow-object",
            STAGE_RADIUS.detail,
            IMAGE_PADDING.detail,
          )}
        >
          <img
            src={image!.url}
            alt={image!.alt}
            loading="lazy"
            className="max-h-[70vh] w-auto max-w-full object-contain"
          />
          <PageEdge size="detail" />
        </div>
      ) : (
        <div
          className={cn(
            "relative w-full overflow-hidden bg-paper-muted transition-[transform,box-shadow] duration-[280ms] ease-out",
            size === "card" ? "aspect-[3/4]" : "aspect-[3/2] lg:aspect-[4/5]",
            STAGE_RADIUS[size],
            hasImage ? "shadow-object" : "border border-dashed border-border",
            interactive &&
              hasImage &&
              "group-hover:-translate-y-1.5 group-hover:shadow-lift group-focus-visible:-translate-y-1.5 group-focus-visible:shadow-lift",
          )}
        >
          {image ? (
            <div className={cn("flex h-full w-full items-center justify-center", IMAGE_PADDING[size])}>
              <img src={image.url} alt={image.alt} loading="lazy" className="h-full w-full object-contain" />
            </div>
          ) : (
            <NoCoverPlaceholder
              iconClassName={size === "detail" ? "size-14" : undefined}
              className={size === "detail" ? "gap-3" : undefined}
            />
          )}
          {hasImage && <PageEdge size={size} />}
        </div>
      )}
      {overlay}
    </div>
  );
}
