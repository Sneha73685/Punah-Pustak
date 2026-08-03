import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import "@/index.css";

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
