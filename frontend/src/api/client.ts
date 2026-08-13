import { API_BASE_URL } from "@/api/config";
import { ApiError, type ApiErrorEnvelope } from "@/api/errors";
import { getAccessToken, setAccessToken } from "@/api/tokenStore";

/**
 * Paths that must never trigger the refresh-and-retry dance below: a 401
 * from `/auth/login` or `/auth/register` is `INVALID_CREDENTIALS`, not an
 * expired access token (neither endpoint even sends one), and refreshing
 * in response to it would waste a round trip at best. `/auth/refresh`
 * itself is excluded so a *failed* refresh never tries to refresh its way
 * out of failing. `/auth/logout` is deliberately NOT in this list — it
 * takes a Bearer token like any other authenticated endpoint, so an
 * expired-token 401 there should be retried exactly the same way.
 */
const NO_RETRY_PATHS = ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh"];

let sessionExpiredHandler: (() => void) | null = null;
let passwordChangeRequiredHandler: (() => void) | null = null;

/** Registered once by `AuthProvider` (src/auth/AuthContext.tsx) on mount. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export function setPasswordChangeRequiredHandler(handler: (() => void) | null): void {
  passwordChangeRequiredHandler = handler;
}

/**
 * SEC-023/024: refresh tokens rotate on every use, and re-presenting an
 * already-rotated one is treated as theft and revokes the whole session.
 * If two requests 401 at nearly the same moment (routine — a page often
 * fires several queries in parallel) and each independently called
 * `POST /auth/refresh`, the second call would present a cookie the first
 * call already rotated away from, triggering exactly that reuse-detection
 * and logging the user out for no real reason. This module-level
 * in-flight promise makes every concurrent caller share one actual
 * network call instead.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function performRefresh(): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    setAccessToken(null);
    return null;
  }
  const body = (await response.json()) as { access_token: string };
  setAccessToken(body.access_token);
  return body.access_token;
}

/**
 * Called once by `AuthProvider` on mount to try to re-establish a session
 * from the `HttpOnly` refresh-token cookie (SEC-022) — the browser sends
 * it automatically; there is nothing else client-side to read it from.
 * Shares the same in-flight lock as the reactive 401 path above, so a
 * mount-time refresh racing an early query's own 401 doesn't double-call.
 */
export async function restoreSession(): Promise<string | null> {
  return refreshAccessToken();
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON-serialized automatically. Use `body` for `FormData` instead. */
  json?: unknown;
  /** Pre-built request body (e.g. `FormData` for image upload) — sent as-is. */
  body?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
}

function buildUrl(path: string, query?: ApiFetchOptions["query"]): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * The one place every API call in this app goes through. Returns `TResponse`
 * on success (`undefined` for a `204 No Content`), or throws `ApiError`
 * (API-010's envelope) for any non-2xx response.
 */
export async function apiFetch<TResponse>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<TResponse> {
  return performFetch<TResponse>(path, options, /* allowRetry */ true);
}

async function performFetch<TResponse>(
  path: string,
  options: ApiFetchOptions,
  allowRetry: boolean,
): Promise<TResponse> {
  // FR-006a/SEC-022: on a cold load (direct URL, bookmark, or a hard
  // refresh — never a same-SPA-session navigation, since the token
  // already lives in memory by then), the access token starts out empty
  // by design and is only re-established asynchronously from the
  // `HttpOnly` refresh-token cookie (`restoreSession`, called once at
  // startup — see `main.tsx`). A request that reads `getAccessToken()`
  // before that completes is indistinguishable from a genuinely
  // unauthenticated caller — which, for most endpoints, just means an
  // extra 401-triggered retry (see below). But a handful of endpoints
  // return a *different* body depending on identity for the exact same
  // URL rather than a 401 — most notably `GET /listings/{id}` on a
  // deleted listing, which is 404 to everyone except the owner/admin
  // (FR-006a). For that request, going out too early doesn't get retried
  // by anything (it's a real, correctly-cached 404, not a 401) — the
  // owner would see a permanent, incorrect "not found" for their own
  // listing. Waiting for a startup restore already in flight closes that
  // window; it is a no-op for every request after that first one
  // resolves.
  if (refreshInFlight) {
    await refreshInFlight;
  }

  const headers = new Headers();
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  } else if (options.body) {
    body = options.body; // FormData: let the browser set the multipart boundary.
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    body,
    credentials: "include",
  });

  if (response.status === 401 && allowRetry && !NO_RETRY_PATHS.includes(path)) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return performFetch<TResponse>(path, options, /* allowRetry */ false);
    }
    sessionExpiredHandler?.();
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  if (!response.ok) {
    const envelope = (await response.json()) as ApiErrorEnvelope;
    if (envelope.error.code === "PASSWORD_CHANGE_REQUIRED") {
      passwordChangeRequiredHandler?.();
    }
    throw new ApiError(response.status, envelope);
  }

  return (await response.json()) as TResponse;
}
