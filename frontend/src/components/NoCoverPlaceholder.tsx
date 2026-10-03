import { cn } from "@/lib/cn";
import type { ListingCategory } from "@/api/types";

/** One cloth board per real category, so a shelf of photo-less listings
 * reads as varied stock rather than a row of identical blanks. Literal
 * class strings (not built at runtime) so Tailwind can see them. */
const CLOTH_CLASSES: Record<ListingCategory, string> = {
  fiction: "bg-cloth-fiction",
  non_fiction: "bg-cloth-non-fiction",
  academic_textbook: "bg-cloth-academic",
  children: "bg-cloth-children",
  comics_graphic_novels: "bg-cloth-comics",
  other: "bg-cloth-other",
};

export type NoCoverSize = "card" | "detail" | "thumb";

export interface NoCoverPlaceholderProps {
  title: string;
  author: string;
  category: ListingCategory;
  size?: NoCoverSize;
  /**
   * Whether the "No photo" tag is exposed to assistive tech here. A caller
   * that already says so in its own text (e.g. a card announcing it after
   * the title) turns this off, so it isn't read first and run into the title.
   */
  announce?: boolean;
  className?: string;
}

/**
 * The no-photo state as a typographic cover: the listing's own title and
 * author set on a plain cloth board, the way an unillustrated secondhand
 * edition actually looks. It is built only from real listing data — no
 * invented artwork — and always carries a visible "No photo" tag so it can
 * never be mistaken for the publisher's cover or for a photo of this copy.
 *
 * The board's title/author are drawn as CSS generated content (from
 * `data-text`) inside an `aria-hidden` box: every caller already renders
 * the same title and author as real text right beside the cover, so
 * putting them in the DOM a second time would make screen readers say
 * them twice and make the browser's find-in-page match every title twice.
 * The "No photo" tag stays real, readable text, since that is information
 * the surrounding text doesn't carry.
 *
 * Type scales with the board via container-query units, so the same
 * component works from a 2-column phone grid up to the detail page. At
 * `thumb` size (inventory rows, admin tables) the board is too small to
 * set type legibly, so it shows the cloth and rule only.
 */
export function NoCoverPlaceholder({
  title,
  author,
  category,
  size = "card",
  announce = true,
  className,
}: NoCoverPlaceholderProps): React.JSX.Element {
  const isThumb = size === "thumb";

  return (
    <div
      className={cn(
        "@container relative aspect-[2/3] w-full overflow-hidden rounded-xs text-paper shadow-object",
        CLOTH_CLASSES[category],
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute flex flex-col items-center border border-paper/35 text-center",
          isThumb ? "inset-[3px]" : "inset-[6%] px-[8%] pt-[18%]",
        )}
      >
        {!isThumb && (
          <>
            <span
              data-text={title}
              className="line-clamp-4 font-serif text-[clamp(13px,10cqw,30px)] font-semibold leading-[1.15] [overflow-wrap:anywhere] before:content-[attr(data-text)]"
            />
            <span className="my-[7%] h-px w-1/4 bg-paper/50" />
            <span
              data-text={author}
              className="line-clamp-2 px-[0.15em] font-serif text-[clamp(12px,7cqw,20px)] italic leading-snug text-paper/90 before:content-[attr(data-text)]"
            />
          </>
        )}
      </div>
      {isThumb ? (
        announce && <span className="sr-only">No photo</span>
      ) : (
        <span
          aria-hidden={announce ? undefined : true}
          className="absolute inset-x-0 bottom-[9%] text-center text-xs font-medium tracking-wide text-paper/90"
        >
          No photo
        </span>
      )}
    </div>
  );
}
