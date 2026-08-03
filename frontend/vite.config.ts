import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Milestone 5: no dev-server proxy to the API. DEPLOY-025 frames local dev
// as genuinely cross-origin (frontend on :5173, API on :8000) and requires
// the backend's CORS configuration to explicitly allow it — a Vite proxy
// would mask that cross-origin request as same-origin and leave CORS
// untested locally, exactly the fidelity gap this project avoids elsewhere
// (e.g. `storage_public_url` vs `storage_endpoint_url` in Milestone 2,
// which exists for the identical "what does the browser actually see"
// reason). `VITE_API_BASE_URL` (see `src/api/client.ts`) points directly
// at the API instead.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
