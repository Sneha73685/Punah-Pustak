import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches, kept in sync as it changes
 * (window resize, rotation). For the few places that need to render a
 * genuinely different structure per breakpoint — e.g. admin's dense table
 * vs. phone cards — rather than restyle one structure with CSS, so only one
 * copy of the content is ever in the DOM.
 *
 * Where `matchMedia` doesn't exist (jsdom in unit tests) it reports
 * `fallback`, so tests get a deterministic layout.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

/** Tailwind's `md` breakpoint (48rem). */
export const MD_UP = "(min-width: 48rem)";

/** Tailwind's `lg` breakpoint (64rem). */
export const LG_UP = "(min-width: 64rem)";
