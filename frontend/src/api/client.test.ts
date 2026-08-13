import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch, restoreSession } from "@/api/client";
import { setAccessToken } from "@/api/tokenStore";

/** A promise this test controls the resolution timing of, to reproduce
 * the exact ordering a cold page load produces without a real network
 * call or a real React render. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("apiFetch waits for an in-flight session restore", () => {
  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  /**
   * Regression test for the FR-006a cold-load bug this suite's
   * `e2e/seller-lifecycle.spec.ts` found: React mounts effects child-first,
   * so a deep child's own data-fetching effect (e.g. `ListingDetailPage`'s
   * `useListing`) starts its request before `AuthProvider`'s own mount
   * effect has restored the access token from the refresh-token cookie.
   * For most endpoints that's harmless (a 401 there just triggers
   * `apiFetch`'s existing retry-after-refresh path) — but a request that
   * started too early for `GET /listings/{id}` on a *deleted* listing gets
   * back a real, correctly-cached 404 (FR-006a: not-owner/not-admin sees
   * 404), which nothing then retries — the owner would see a permanent,
   * incorrect "not found" for their own listing on every cold load.
   *
   * `main.tsx` now kicks off `restoreSession()` before React renders
   * anything, and `performFetch` (this test's real subject) awaits that
   * in-flight promise before reading the access token — this test proves
   * that second half directly: a request that starts *while* a restore is
   * in flight must not be dispatched until the restore resolves, and must
   * then carry the token the restore produced.
   */
  it("delays a request started during an in-flight restore until the restore resolves, then uses its token", async () => {
    const refreshCall = deferred<Response>();
    const listingCall = deferred<Response>();

    const fetchMock = vi.fn((input: string | URL, _init?: RequestInit) => {
      const url = input.toString();
      return url.includes("/auth/refresh") ? refreshCall.promise : listingCall.promise;
    });
    vi.stubGlobal("fetch", fetchMock);

    // Mirrors `main.tsx`: kick off the restore, don't await it yet.
    const restorePromise = restoreSession();

    // Mirrors `ListingDetailPage`'s `useListing` firing before that
    // restore's mount-order-earlier sibling effect has resolved.
    const listingFetchPromise = apiFetch("/api/v1/listings/some-id");

    // Flush pending microtasks without letting the still-pending mocked
    // fetches resolve — if the bug were present, the listing request
    // would already have been dispatched by this point.
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/v1/auth/refresh"), expect.anything());

    refreshCall.resolve(
      new Response(JSON.stringify({ access_token: "restored-token", token_type: "bearer", expires_in: 900 }), {
        status: 200,
      }),
    );
    await restorePromise;
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, listingRequestInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((listingRequestInit.headers as Headers).get("Authorization")).toBe("Bearer restored-token");

    listingCall.resolve(new Response(JSON.stringify({ id: "some-id" }), { status: 200 }));
    await listingFetchPromise;
  });
});
