import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { restoreSession } from "@/api/client";
import "@/index.css";

// Kicked off here, before React renders anything, rather than left solely
// to `AuthProvider`'s own mount effect: React runs mount effects
// child-first, so a deep child's own data-fetching effect (e.g.
// `ListingDetailPage`'s `useListing`) fires before an ancestor provider's
// effect does. Without an already-in-flight restore for `apiFetch`
// (src/api/client.ts) to wait on, that child's very first request goes
// out before the access token is restored from the refresh-token cookie —
// harmless for most endpoints (a 401 there just triggers `apiFetch`'s
// existing retry-after-refresh path), but wrong for the few whose
// response depends on identity for an otherwise-identical URL, e.g.
// FR-006a's "owner still sees their own deleted listing." `AuthProvider`
// still calls `restoreSession()` itself on mount, exactly as before — that
// call reuses this same in-flight promise (see `refreshAccessToken`'s own
// dedup) rather than firing a second request.
void restoreSession();

// FE-003: TanStack Query owns all server state. `staleTime` is not 0
// (TanStack Query's own default) because this app's data changes only in
// response to the current user's own actions or another actor's (an
// admin's) — polling/near-realtime freshness isn't a requirement anywhere
// in the SRS, and a short default staleTime just means more redundant
// refetches on ordinary navigation. Individual queries override this where
// "just mutated, must be fresh" actually matters (handled via
// invalidateQueries after each mutation instead).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element (#root) not found in index.html.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
