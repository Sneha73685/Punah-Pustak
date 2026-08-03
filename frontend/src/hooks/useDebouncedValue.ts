import { useEffect, useState } from "react";

/** Delays reflecting `value` until it's stopped changing for `delayMs` —
 * used on the browse search box so every keystroke doesn't fire its own
 * query (FR-002's full-text search still runs server-side per keystroke
 * without this, which works but is wasteful and can make results flicker
 * as slower/faster requests race and resolve out of order). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
