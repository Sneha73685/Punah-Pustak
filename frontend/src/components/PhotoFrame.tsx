import { useState } from "react";

import { NoCoverPlaceholder } from "@/components/NoCoverPlaceholder";
import { cn } from "@/lib/cn";

export interface PhotoFrameImage {
  url: string;
  alt: string;
}

export type PhotoFrameVariant = "grid" | "thumb" | "stage";

export interface PhotoFrameProps {
  /** Omit to render the missing-evidence tile instead. */
  image?: PhotoFrameImage;
  /** Real listing data, used only by the no-photo tile. */
  title: string;
  author: string;
  /**
   * - `grid`: a square field, used by every listing grid and list row.
   * - `thumb`: the same square at ledger/admin size, with a tighter inset.
   * - `stage`: the detail page's primary photo. The field takes the photo's
   *   own shape, clamped between 4:3 and 3:4, so a wide page-block shot
   *   isn't a thin band in a large empty square.
   */
  variant?: PhotoFrameVariant;
  /** Desaturates a copy that is no longer for sale (owner/admin views). */
  inactive?: boolean;
  /** Passed to the no-photo tile; see `NoCoverPlaceholder`'s `announce`. */
  announceNoPhoto?: boolean;
  className?: string;
}

const STAGE_MIN_RATIO = 3 / 4;
const STAGE_MAX_RATIO = 4 / 3;

/**
 * The evidence field every seller photo sits on.
 *
 * A seller's photo is never cropped and never decorated: it is scaled to fit
 * inside a ~6% inset on a neutral field, at its true proportions, with no
 * shadow. A 3:1 page-block shot stays 3:1 and a 1:3 spine shot stays 1:3;
 * it is the identical square field around them that makes a grid of messy
 * phone photos read as one consistent record. The field darkens slightly
 * when its listing link is hovered or focused (the parent's `group`).
 *
 * A photo stays hidden until it has loaded (the field is already sized, so
 * nothing moves), and one that fails to load falls back to the no-photo
 * tile rather than a broken-image icon.
 */
export function PhotoFrame({
  image,
  title,
  author,
  variant = "grid",
  inactive = false,
  announceNoPhoto = true,
  className,
}: PhotoFrameProps): React.JSX.Element {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const [ratio, setRatio] = useState(1);
  const fallbackSize = variant === "stage" ? "stage" : variant;

  if (!image || state === "failed") {
    return (
      <NoCoverPlaceholder
        size={fallbackSize}
        title={title}
        author={author}
        announce={announceNoPhoto}
        className={cn("transition-colors duration-150 group-hover:bg-field-hover group-focus-visible:bg-field-hover", className)}
      />
    );
  }

  function handleLoaded(element: HTMLImageElement): void {
    if (element.naturalWidth === 0) {
      setState("failed");
      return;
    }
    const natural = element.naturalWidth / element.naturalHeight;
    setRatio(Math.min(Math.max(natural, STAGE_MIN_RATIO), STAGE_MAX_RATIO));
    setState("loaded");
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xs bg-field transition-colors duration-150",
        "group-hover:bg-field-hover group-focus-visible:bg-field-hover",
        variant !== "stage" && "aspect-square",
        className,
      )}
      style={variant === "stage" ? { aspectRatio: ratio } : undefined}
    >
      {/* Absolutely positioned so an oversized photo can never stretch the
          field (an aspect-ratio box grows to fit its content otherwise). */}
      <div className="absolute inset-[6%]">
        <img
          // Catches an image that finished (e.g. from cache) before React
          // attached `onLoad`.
          ref={(element) => {
            if (element?.complete && state === "loading") {
              handleLoaded(element);
            }
          }}
          src={image.url}
          alt={image.alt}
          loading={variant === "stage" ? undefined : "lazy"}
          decoding="async"
          onLoad={(event) => handleLoaded(event.currentTarget)}
          onError={() => setState("failed")}
          className={cn(
            "h-full w-full object-contain",
            state === "loading" ? "invisible" : "animate-photo-in",
            inactive && "opacity-50 grayscale",
          )}
        />
      </div>
    </div>
  );
}
