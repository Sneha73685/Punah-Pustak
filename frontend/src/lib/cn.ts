/**
 * Joins conditional class names, skipping falsy values. A hand-rolled
 * one-liner rather than the `clsx`/`classnames` dependency most projects
 * reach for — this codebase's backend already prefers a small hand-rolled
 * utility over a dependency when the need is this narrow (see e.g.
 * `app.core.rate_limit`'s hand-rolled limiter, `image_validation.py`'s
 * hand-rolled magic-byte sniffing); the same judgment applies here.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
