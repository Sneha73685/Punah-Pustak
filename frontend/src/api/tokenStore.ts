/**
 * SEC-022: "The access token MUST be delivered to the frontend and stored
 * in memory (JS variable / React context), NOT localStorage." A plain
 * module-level variable satisfies this literally and is deliberately kept
 * separate from `AuthContext` (src/auth/AuthContext.tsx): this module is
 * what the framework-agnostic `apiFetch` (src/api/client.ts) reads/writes
 * on every request/refresh, while `AuthContext` is the React-facing
 * "who's logged in" state derived from it. Threading the token through
 * React context into a plain `fetch` wrapper would force every call site
 * to be a component/hook; a module-level variable lets `apiFetch` stay a
 * plain function callable from anywhere (including outside React, e.g. a
 * future non-component script), while `AuthContext` still owns *when* it
 * gets set (login/refresh/logout) and re-renders subscribers when it does.
 *
 * Lost on a full page reload by design — that's what the `HttpOnly`
 * refresh-token cookie (also SEC-022) is for: `AuthContext` calls
 * `POST /auth/refresh` once on mount to re-establish an access token from
 * that cookie, exactly the same call `apiFetch` itself makes on a 401.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
