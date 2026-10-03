import { useState } from "react";

import { NoCoverPlaceholder } from "@/components/NoCoverPlaceholder";
import { cn } from "@/lib/cn";
import type { ListingCategory } from "@/api/types";

export interface BookCoverImage {
  url: string;
  alt: string;
}

export type BookCoverSize = "card" | "detail" | "thumb";

export interface BookCoverProps {
  /** Omit to render the typographic no-photo cover instead. */
  image?: BookCoverImage;
  /** Real listing data, used only by the no-photo cover. */
  title: string;
  author: string;
  category: ListingCategory;
  /**
   * - `card`: a fixed 2:3 shelf slot, used by every listing grid.
   * - `detail`: the single large presentation on the listing page — a
   *   fixed 2:3 frame capped by viewport height on small screens.
   * - `thumb`: a small fixed slot for inventory rows and admin tables.
   */
  size?: BookCoverSize;
  /** Hover/focus lift, for covers inside a link (the card's `group`). */
  interactive?: boolean;
  /** Dims a cover whose listing is no longer for sale (owner/admin views). */
  inactive?: boolean;
  /** Passed to the no-photo cover; see `NoCoverPlaceholder`'s `announce`. */
  announceNoPhoto?: boolean;
  className?: string;
}

const SLOT_CLASSES: Record<Exclude<BookCoverSize, "detail">, string> = {
  card: "aspect-[2/3] w-full",
  thumb: "aspect-[2/3] w-full",
};

/**
 * The "book on a shelf" object, shared by every surface that shows a
 * listing's cover.
 *
 * A real photo is never cropped and never framed. In the `card`/`thumb`
 * slot it is `object-contain`-sized by its own aspect ratio and pinned to
 * the slot's bottom edge, so a row of covers with different shapes (a tall
 * paperback, a squat hardback, a landscape phone photo) all stand on one
 * shared baseline. The shadow and 2px radius sit on the `<img>` box itself,
 * which — because the image is auto-sized rather than stretched — is
 * exactly the photo's silhouette. A landscape photo therefore fills the
 * slot's full width at its true shape instead of shrinking inside a frame.
 *
 * Without a photo, the slot holds the typographic cover from
 * `NoCoverPlaceholder`, which carries the same shadow so photo and no-photo
 * stock read as the same kind of object.
 *
 * The hover lift is transform/box-shadow only and gated behind
 * `motion-safe`, so reduced-motion users get the shadow change without
 * movement.
 */
export function BookCover({
  image,
  title,
  author,
  category,
  size = "card",
  interactive = false,
  inactive = false,
  announceNoPhoto = true,
  className,
}: BookCoverProps): React.JSX.Element {
  const lift =
    interactive &&
    "transition-[transform,box-shadow] duration-150 ease-out group-hover:shadow-object-hover group-focus-visible:shadow-object-hover motion-safe:group-hover:-translate-y-0.5 motion-safe:group-focus-visible:-translate-y-0.5";
  const dim = inactive && "opacity-60 saturate-50";

  if (size === "detail") {
    // One fixed 2:3 frame for photo, no-photo cover and the page skeleton
    // alike — 33vh wide (a 50vh-tall frame) on small screens, up to 360px
    // in the desktop column — so the layout is settled before the photo
    // has downloaded. The photo is contained and bottom-aligned inside it,
    // exactly as on the shelf; the width lives on this wrapper because the
    // placeholder's own `w-full` would otherwise compete with it (`cn`
    // doesn't merge conflicting utilities).
    return (
      <div className={cn("flex justify-center", className)}>
        <div className="relative aspect-[2/3] w-[min(100%,33vh)] lg:w-full lg:max-w-[360px]">
          {image ? (
            // Bottom-aligned on phones (the photo sits right above the
            // title); top-aligned beside the title column from `lg` up.
            <div className="absolute inset-0 flex items-end justify-center lg:items-start">
              <CoverImage
                src={image.url}
                alt={image.alt}
                className={cn("block rounded-xs object-contain shadow-object", dim)}
                fallback={
                  <NoCoverPlaceholder size="detail" title={title} author={author} category={category} className={cn(dim)} />
                }
              />
            </div>
          ) : (
            <NoCoverPlaceholder size="detail" title={title} author={author} category={category} className={cn(dim)} />
          )}
        </div>
      </div>
    );
  }

  // The photo sits in an absolutely positioned frame rather than directly in
  // the aspect-ratio slot: an aspect-ratio box grows to fit oversized
  // content (its automatic minimum height), so a very tall photo would
  // otherwise stretch its slot — and with it the whole grid row — instead
  // of being contained by it. `inset-0` gives the frame a definite size
  // for `max-h-full`/`max-w-full` to resolve against.
  return (
    <div className={cn("relative", SLOT_CLASSES[size], className)}>
      {image ? (
        <div className="absolute inset-0 flex items-end justify-center">
          <CoverImage
            src={image.url}
            alt={image.alt}
            lazy
            className={cn("block rounded-xs object-contain shadow-object", lift, dim)}
            fallback={
              <NoCoverPlaceholder
                size={size}
                title={title}
                author={author}
                category={category}
                announce={announceNoPhoto}
                className={cn(lift, dim)}
              />
            }
          />
        </div>
      ) : (
        <NoCoverPlaceholder
          size={size}
          title={title}
          author={author}
          category={category}
          announce={announceNoPhoto}
          className={cn(lift, dim)}
        />
      )}
    </div>
  );
}

interface CoverImageProps {
  src: string;
  alt: string;
  className: string;
  lazy?: boolean;
  /** Rendered instead if the photo fails to load. */
  fallback: React.ReactNode;
}

/** Every cover slot (card, thumb, detail frame) is 2:3. */
const SLOT_RATIO = 2 / 3;

/**
 * A cover photo that stays `visibility: hidden` until it has loaded. The
 * frame around it is already sized, so nothing else moves either way — but
 * an auto-sized `<img>` starts as an empty box and grows when its pixels
 * arrive, which the browser counts as a layout shift of the image itself.
 * Hidden, it's simply revealed at its final size. A photo that fails to
 * load (a missing object in storage, say) falls back to the typographic
 * no-photo cover rather than a broken-image icon.
 *
 * Once loaded, its natural aspect ratio decides which side fills the 2:3
 * slot: height for a photo taller than the slot, width for a wider one.
 * That is `object-contain` behaviour — never cropped, small photos scaled
 * up — while keeping the `<img>` box equal to the photo itself, so the
 * shadow and rounded corners follow the photo's real silhouette.
 */
function CoverImage({ src, alt, className, lazy = false, fallback }: CoverImageProps): React.JSX.Element {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const [isTallerThanSlot, setIsTallerThanSlot] = useState(true);

  function handleLoaded(element: HTMLImageElement): void {
    if (element.naturalWidth === 0) {
      setState("failed");
      return;
    }
    setIsTallerThanSlot(element.naturalWidth / element.naturalHeight <= SLOT_RATIO);
    setState("loaded");
  }

  if (state === "failed") {
    return <>{fallback}</>;
  }
  return (
    <img
      // Catches an image that finished (e.g. from cache) before React
      // attached `onLoad`.
      ref={(element) => {
        if (element?.complete && state === "loading") {
          handleLoaded(element);
        }
      }}
      src={src}
      alt={alt}
      loading={lazy ? "lazy" : undefined}
      onLoad={(event) => handleLoaded(event.currentTarget)}
      onError={() => setState("failed")}
      className={cn(
        className,
        state === "loading" && "invisible max-h-full max-w-full",
        state === "loaded" && (isTallerThanSlot ? "h-full w-auto" : "h-auto w-full"),
      )}
    />
  );
}
