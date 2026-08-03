/**
 * `VITE_API_BASE_URL`: the browser-reachable origin of the API — not
 * necessarily what any server-side process would use to reach it (there
 * is no server-side process here; this is a pure SPA), but worth naming
 * explicitly the same way the backend's `storage_public_url` vs
 * `storage_endpoint_url` split (Milestone 2) documents "what does the
 * browser actually see" as its own concern. Defaults to the docker-compose
 * /local-dev API port so `npm run dev` works with zero configuration.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";
